export const LOYALTY_REWARDS = Object.freeze([
  Object.freeze({ points: 100, value: 5, discount_cents: 500 }),
  Object.freeze({ points: 200, value: 12, discount_cents: 1200 }),
  Object.freeze({ points: 300, value: 20, discount_cents: 2000 }),
  Object.freeze({ points: 500, value: 40, discount_cents: 4000 })
]);

export const LOYALTY_REWARD_MAP = new Map(
  LOYALTY_REWARDS.map(reward => [
    reward.points,
    reward.discount_cents
  ])
);

export function publicLoyaltyRewards() {
  return LOYALTY_REWARDS.map(({ points, value }) => ({
    points,
    value
  }));
}
