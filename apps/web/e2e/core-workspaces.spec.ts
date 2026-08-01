import { expect, test, type BrowserContext } from '@playwright/test';

const cycleId = 'c1c1e000-0000-4000-8000-000000000001';

async function become(context: BrowserContext, persona: string) {
  await context.addCookies([
    {
      name: 'relayflow_dev_actor',
      value: persona,
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax',
    },
  ]);
}

test('QSTP cycle creation uses a context-preserving side panel', async ({ page, context }) => {
  await become(context, 'manager');
  await page.goto('/cycles', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Create cycle' }).click();

  await expect(page.locator('[data-rf-side-panel]')).toBeVisible();
  await expect(page.locator('[data-rf-overlay]')).toHaveCount(0);
  await expect(page.getByLabel('Cycle name')).toBeVisible();
  await expect(page.getByLabel('Funded weekly hours')).toBeVisible();
});

test('QSTP can switch between cycle-scoped core workspaces', async ({ page, context }) => {
  await become(context, 'manager');
  await page.goto(`/cycles/${cycleId}/allocation`);
  await expect(page.getByText('Participation and decisions')).toBeVisible();

  await page.goto(`/cycles/${cycleId}/positions`);
  await expect(page.getByText('Position collection and approval')).toBeVisible();

  await page.goto(`/cycles/${cycleId}/placements`);
  await expect(page.getByText('Requirement templates')).toBeVisible();
});

test('startup and candidate canonical workspaces are isolated by persona', async ({ page, context }) => {
  await become(context, 'startupOwner');
  await page.goto(`/startup/cycles/${cycleId}/selection`);
  await expect(page.getByText('Candidate processes')).toBeVisible();

  await become(context, 'candidate');
  await page.goto(`/candidate/cycles/${cycleId}/placements`);
  await expect(page.getByRole('heading', { name: '20 h placement' })).toBeVisible();
  await expect(page.getByText('Requirement templates')).toHaveCount(0);
});

test('legacy stage URLs redirect to canonical cycle URLs', async ({ page, context }) => {
  await become(context, 'manager');
  await page.goto('/positions');
  await expect(page).toHaveURL(`/cycles/${cycleId}/positions`);
});
