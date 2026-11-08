const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../logic.js');

const SOWN = '2026-11-01';

function setup(overrides = {}) {
  const state = G.newState();
  const grow = G.createGrow(state, {
    variety: 'Broccoli',
    seedGrams: 7,
    trayColour: 'Orange',
    medium: 'Silicone mat',
    sownOn: SOWN,
    plannedDays: { germination: 3, blackout: 1, light: 4 },
    ...overrides,
  });
  return { state, grow };
}

test('tray IDs count up and are never reused', () => {
  const { state, grow } = setup();
  const second = G.createGrow(state, { ...grow, plannedDays: grow.plannedDays });
  assert.equal(grow.code, 'Grow 1');
  assert.equal(second.code, 'Grow 2');
  state.grows.pop();
  assert.equal(G.createGrow(state, { ...grow, plannedDays: grow.plannedDays }).code, 'Grow 3');
});

test('counts down to the next stage', () => {
  const { grow } = setup();
  const counts = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'].map(
    (day) => G.countdown(grow, day).daysLeft
  );
  assert.deepEqual(counts, [3, 2, 1, 0]);
  assert.equal(G.countdown(grow, SOWN).nextLabel, 'Blackout');
});

test('never moves a stage just because time has passed', () => {
  const { grow } = setup();
  const later = G.countdown(grow, '2026-11-20');
  assert.equal(G.currentStage(grow), 'germination');
  assert.equal(later.isDue, true);
  assert.equal(later.overdueBy, 16);
});

test('"not yet" pushes the check back and clears it from today', () => {
  const { state, grow } = setup();
  assert.equal(G.todayView(state, '2026-11-04').checks.length, 1);

  G.notReady(grow, '2026-11-04', { recheckInDays: 2, note: 'Cold room' });

  assert.equal(G.currentStage(grow), 'germination');
  assert.equal(G.todayView(state, '2026-11-04').checks.length, 0);
  assert.equal(G.countdown(grow, '2026-11-04').daysLeft, 2);
  assert.equal(G.todayView(state, '2026-11-06').checks.length, 1);
  assert.equal(grow.checks[0].note, 'Cold room');
});

test('next countdown starts from the day the tray actually moved', () => {
  const { grow } = setup();
  G.notReady(grow, '2026-11-04', { recheckInDays: 2 });
  G.moveToNext(grow, '2026-11-06');
  const count = G.countdown(grow, '2026-11-06');
  assert.equal(G.currentStage(grow), 'blackout');
  assert.equal(count.dueOn, '2026-11-07');
  assert.equal(count.rechecking, false);
});

test('moving early is allowed', () => {
  const { grow } = setup();
  G.moveToNext(grow, '2026-11-02');
  assert.equal(G.currentStage(grow), 'blackout');
  assert.equal(G.countdown(grow, '2026-11-02').dueOn, '2026-11-03');
});

test('blackout can be skipped from germination only', () => {
  const { grow } = setup();
  G.moveToNext(grow, '2026-11-03', { skipBlackout: true });
  assert.equal(G.currentStage(grow), 'light');
  assert.equal(grow.skippedBlackout, true);
  assert.throws(() => G.moveToNext(grow, '2026-11-04', { skipBlackout: true }));

  const other = setup().grow;
  G.moveToNext(other, '2026-11-03');
  assert.throws(() => G.moveToNext(other, '2026-11-04', { skipBlackout: true }));
});

test('a move cannot be dated before the current stage started', () => {
  const { grow } = setup();
  G.moveToNext(grow, '2026-11-04');
  assert.throws(() => G.moveToNext(grow, '2026-11-03'), /before this stage/);
  assert.equal(G.currentStage(grow), 'blackout');
});

test('water is only due in the light stage and suggests the set amounts', () => {
  const { state, grow } = setup();
  assert.equal(G.waterAdvice(grow, state.settings, SOWN).due, false);
  G.moveToNext(grow, '2026-11-04');
  assert.equal(G.waterAdvice(grow, state.settings, '2026-11-04').due, false);
  G.moveToNext(grow, '2026-11-05');

  const first = G.waterAdvice(grow, state.settings, '2026-11-05');
  assert.equal(first.due, true);
  assert.equal(first.suggestedMl, 240);
  assert.match(first.text, /240 ml/);

  G.logWater(grow, '2026-11-05', 240);
  assert.equal(G.waterAdvice(grow, state.settings, '2026-11-05').due, false);

  const next = G.waterAdvice(grow, state.settings, '2026-11-06');
  assert.equal(next.due, true);
  assert.match(next.text, /60–120 ml/);
  assert.doesNotMatch(next.text, /cup/);
});

test('a harvest records yield, water and actual days against the plan', () => {
  const { state, grow } = setup();
  G.moveToNext(grow, '2026-11-05');
  G.moveToNext(grow, '2026-11-06');
  G.logWater(grow, '2026-11-06', 240);
  G.logWater(grow, '2026-11-07', 60);
  G.harvest(grow, { on: '2026-11-12', grams: 140, problems: ['Mould'] });

  assert.equal(grow.status, 'harvested');
  assert.equal(G.gramsPerGramOfSeed(grow), 20);
  assert.equal(G.totalWaterMl(grow), 300);
  assert.deepEqual(
    G.stageHistory(grow).map((s) => [s.stage, s.plannedDays, s.actualDays]),
    [['germination', 3, 4], ['blackout', 1, 1], ['light', 4, 6]]
  );
  assert.equal(G.todayView(state, '2026-11-20').growing.length, 0);
});

test('harvest needs a tray in the light stage', () => {
  const { grow } = setup();
  assert.throws(() => G.harvest(grow, { on: '2026-11-04' }), /light stage/);
});

test('a missing harvest weight gives no yield rather than a wrong one', () => {
  const { grow } = setup();
  G.moveToNext(grow, '2026-11-03', { skipBlackout: true });
  G.harvest(grow, { on: '2026-11-08' });
  assert.equal(G.gramsPerGramOfSeed(grow), null);
});

test('undo reverses a harvest, then moves, and stops at the start', () => {
  const { grow } = setup();
  G.moveToNext(grow, '2026-11-03', { skipBlackout: true });
  G.harvest(grow, { on: '2026-11-08', grams: 100 });

  G.undoLast(grow);
  assert.equal(grow.status, 'growing');
  assert.equal(grow.harvest, null);
  assert.equal(G.currentStage(grow), 'light');

  G.undoLast(grow);
  assert.equal(G.currentStage(grow), 'germination');
  assert.equal(grow.skippedBlackout, false);
  assert.throws(() => G.undoLast(grow), /no move to undo/);
});

test('planned days follow what the variety actually did last time', () => {
  const { state, grow } = setup();
  assert.equal(G.plannedDaysFor(state, 'Radish').fromGrow, null);
  assert.deepEqual(G.plannedDaysFor(state, 'broccoli').days, state.settings.plannedDays);

  G.moveToNext(grow, '2026-11-05');
  G.moveToNext(grow, '2026-11-06');
  G.harvest(grow, { on: '2026-11-12' });

  const result = G.plannedDaysFor(state, ' BROCCOLI ');
  assert.equal(result.fromGrow, grow);
  assert.deepEqual(result.days, { germination: 4, blackout: 1, light: 6 });
});

test('a skipped blackout does not plan a zero-day blackout next time', () => {
  const { state, grow } = setup();
  G.moveToNext(grow, '2026-11-03', { skipBlackout: true });
  G.harvest(grow, { on: '2026-11-08' });
  assert.equal(G.plannedDaysFor(state, 'Broccoli').days.blackout, 1);
});

test('day counts hold across a clock change', () => {
  assert.equal(G.daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(G.addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(G.daysBetween('2026-03-07', '2026-03-09'), 2);
});
