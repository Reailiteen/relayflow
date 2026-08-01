import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  colorsFor,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  space,
  type SemanticColors,
  type StatusTone,
} from '@relayflow/tokens';

/**
 * Native counterparts to the web primitives.
 *
 * They read the same tokens, so a colour or spacing decision made once shows up
 * on both platforms — but they are not a port of the web components. Density is
 * dialled back deliberately: 13px body text and 32px rows are right for a
 * mouse-driven console and wrong for a thumb. Type steps up, targets grow to
 * 44px, and the borrowed structure stops there.
 */

export interface ThemedProps {
  colors: SemanticColors;
}

export function useColors(scheme: string | null | undefined): SemanticColors {
  return colorsFor(scheme);
}

// ─── Surface ─────────────────────────────────────────────────────────────────

export function Card({
  colors,
  children,
  padded = true,
}: ThemedProps & { children: React.ReactNode; padded?: boolean }) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        padded && styles.cardPadded,
      ]}
    >
      {children}
    </View>
  );
}

export function CardHeader({ colors, title, aside }: ThemedProps & { title: string; aside?: React.ReactNode }) {
  return (
    <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
      <Text style={[styles.cardHeaderText, { color: colors.textSecondary }]} numberOfLines={1}>
        {title.toUpperCase()}
      </Text>
      {aside}
    </View>
  );
}

// ─── Text ────────────────────────────────────────────────────────────────────

export function Heading({ colors, children }: ThemedProps & { children: React.ReactNode }) {
  return <Text style={[styles.heading, { color: colors.textPrimary }]}>{children}</Text>;
}

export function Body({
  colors,
  muted = false,
  children,
}: ThemedProps & { muted?: boolean; children: React.ReactNode }) {
  return (
    <Text style={[styles.body, { color: muted ? colors.textSecondary : colors.textPrimary }]}>
      {children}
    </Text>
  );
}

export function Caption({ colors, children }: ThemedProps & { children: React.ReactNode }) {
  return <Text style={[styles.caption, { color: colors.textMuted }]}>{children}</Text>;
}

// ─── Status ──────────────────────────────────────────────────────────────────

const toneColor = (colors: SemanticColors, tone: StatusTone) =>
  tone === 'positive'
    ? { bg: colors.positiveSubtle, fg: colors.positiveText }
    : tone === 'warning'
      ? { bg: colors.warningSubtle, fg: colors.warningText }
      : tone === 'critical'
        ? { bg: colors.criticalSubtle, fg: colors.criticalText }
        : tone === 'info'
          ? { bg: colors.infoSubtle, fg: colors.infoText }
          : { bg: colors.surfaceSunken, fg: colors.textSecondary };

export function Badge({
  colors,
  tone = 'neutral',
  children,
}: ThemedProps & { tone?: StatusTone; children: string }) {
  const { bg, fg } = toneColor(colors, tone);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{children.toUpperCase()}</Text>
    </View>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────

export function Button({
  colors,
  label,
  onPress,
  variant = 'secondary',
  disabled = false,
  busy = false,
}: ThemedProps & {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const background =
    variant === 'primary' ? colors.accent : variant === 'danger' ? colors.critical : colors.surface;
  const foreground =
    variant === 'secondary' ? colors.textPrimary : colors.accentText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      // 44pt minimum: below that a thumb misses, and this is the only input.
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: variant === 'secondary' ? colors.border : background,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        <Text style={[styles.buttonText, { color: foreground }]}>{label}</Text>
      )}
    </Pressable>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

export function Row({
  colors,
  title,
  subtitle,
  right,
  onPress,
  last = false,
}: ThemedProps & {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const content = (
    <View
      style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
    >
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: colors.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
}

export function EmptyState({ colors, children }: ThemedProps & { children: string }) {
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  cardPadded: { padding: space[4] },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[2.5],
    borderBottomWidth: 1,
  },
  cardHeaderText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  heading: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize['2xl'] * lineHeight.tight,
  },
  body: { fontSize: fontSize.lg, lineHeight: fontSize.lg * lineHeight.normal },
  caption: { fontSize: fontSize.md, lineHeight: fontSize.md * lineHeight.snug },
  badge: {
    paddingHorizontal: space[1.5],
    paddingVertical: space[0.5],
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.4 },
  button: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: fontSize.lg, fontWeight: fontWeight.medium },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    minHeight: 56,
  },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.medium },
  rowSubtitle: { fontSize: fontSize.md },
  empty: { padding: space[6], alignItems: 'center' },
  emptyText: { fontSize: fontSize.md, textAlign: 'center' },
});
