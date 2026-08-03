-- The catalog, as one JSON document, for scripts/generate-types.mjs.
--
-- `supabase gen types` would do this, but it runs postgres-meta in a container
-- and this project has no Docker by design (supabase/README.md). Reading the
-- catalog directly needs neither, and produces the same answer because the
-- migrations are the same migrations.

select json_build_object(

  'tables', (
    select coalesce(json_agg(t order by t ->> 'name'), '[]'::json) from (
      select json_build_object(
        'name', c.relname,
        'columns', (
          select json_agg(json_build_object(
            'name', a.attname,
            'notNull', a.attnotnull,
            -- A column with a default or an identity may be omitted on insert.
            'hasDefault', a.atthasdef or a.attidentity <> '',
            'type', json_build_object(
              'name', ty.typname,
              'kind', ty.typtype,
              'category', ty.typcategory,
              'element', elem.typname,
              'elementKind', elem.typtype,
              'base', base.typname,
              'baseKind', base.typtype
            )
          ) order by a.attnum)
          from pg_attribute a
          join pg_type ty on ty.oid = a.atttypid
          left join pg_type elem on elem.oid = ty.typelem and ty.typcategory = 'A'
          left join pg_type base on base.oid = ty.typbasetype
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        )
      ) as t
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    ) tables
  ),

  -- Foreign keys become `Relationships`, which is what makes an embedded
  -- select — `select=*,redistribution_invitations(*)` — typecheck rather than
  -- resolve to supabase-js's "could not find a relationship" error type.
  'foreignKeys', (
    select coalesce(json_agg(f), '[]'::json) from (
      select json_build_object(
        'name', con.conname,
        'table', src.relname,
        'columns', (
          select array_agg(att.attname order by k.ord)
          from unnest(con.conkey) with ordinality as k(attnum, ord)
          join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
        ),
        'referencedTable', tgt.relname,
        'referencedColumns', (
          select array_agg(att.attname order by k.ord)
          from unnest(con.confkey) with ordinality as k(attnum, ord)
          join pg_attribute att on att.attrelid = con.confrelid and att.attnum = k.attnum
        ),
        -- One-to-one exactly when the referencing columns are themselves unique.
        'isOneToOne', exists (
          select 1 from pg_index i
          where i.indrelid = con.conrelid
            and i.indisunique
            and i.indnatts = array_length(con.conkey, 1)
            and i.indkey::int2[] @> con.conkey
            and con.conkey @> i.indkey::int2[]
        )
      ) as f
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      join pg_class tgt on tgt.oid = con.confrelid
      join pg_namespace n on n.oid = src.relnamespace
      where con.contype = 'f' and n.nspname = 'public'
    ) fks
  ),

  'enums', (
    select coalesce(json_agg(e order by e ->> 'name'), '[]'::json) from (
      select json_build_object(
        'name', t.typname,
        'values', (
          select array_agg(l.enumlabel order by l.enumsortorder)
          from pg_enum l where l.enumtypid = t.oid
        )
      ) as e
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typtype = 'e'
    ) enums
  ),

  'functions', (
    select coalesce(json_agg(f order by f ->> 'name'), '[]'::json) from (
      select json_build_object(
        'name', p.proname,
        'arguments', pg_get_function_arguments(p.oid),
        'returns', pg_get_function_result(p.oid),
        'returnsSet', p.proretset
      ) as f
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind = 'f'
        -- Trigger functions are not callable over PostgREST.
        and pg_get_function_result(p.oid) <> 'trigger'
        -- pgcrypto installs `armor`, `crypt` and friends into public, several of
        -- them overloaded. They are not part of this schema's surface, and an
        -- overload set cannot be expressed as one key in the Functions map.
        and not exists (
          select 1 from pg_depend d
          where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
        )
    ) functions
  )

);
