// Grow rules with no browser code, so they can be tested with `node --test`.
// A stage only ever changes through moveToNext, harvest or endGrow: time passing
// makes a check due, but never moves a tray.
(function (root) {
  const STAGES = {
    germination: {
      label: 'Germination',
      care: 'Weighted tray on top. Mist 1–2 times a day, and only if the surface looks dry.',
    },
    blackout: {
      label: 'Blackout',
      care: 'Top tray flipped into a dome, no weight. No bottom watering yet.',
    },
    light: {
      label: 'Light',
      care: 'Lights on, no top tray. Bottom water only, with no top misting.',
    },
  };

  const TRANSITIONS = {
    germination: {
      next: 'blackout',
      question: 'Ready to move into blackout?',
      lookFor: [
        'More yellow plant than dark seed hulls across the tray',
        'Stems starting to bend and push against the top tray',
      ],
      then: 'Take the weight off and flip the top tray upside down to make a dome.',
    },
    blackout: {
      next: 'light',
      question: 'Ready to move into the light?',
      lookFor: [
        'Seedlings have lifted the dome by about 1 cm',
        'White stems, stretched but still standing upright',
        'Don’t leave it longer if they start to lean',
      ],
      then: 'Take the dome off, turn the lights on and start bottom watering.',
    },
    light: {
      next: 'harvest',
      question: 'Ready to harvest?',
      lookFor: ['First true leaves showing', 'About 4–8 cm tall'],
      then: 'Cut just above the mat and weigh the harvest.',
    },
  };

  const NEXT_LABEL = { blackout: 'Blackout', light: 'Light', harvest: 'Harvest' };

  const DEFAULT_SETTINGS = {
    colours: ['Blue', 'Purple', 'Pink', 'Green', 'Orange'],
    mediums: ['Silicone mat', 'Soil', 'Coco coir'],
    plannedDays: { germination: 3, blackout: 1, light: 4 },
    water: { firstMl: 240, topUpMinMl: 60, topUpMaxMl: 120 },
  };

  function newState() {
    return { nextGrowNumber: 1, grows: [], settings: clone(DEFAULT_SETTINGS) };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // Dates are plain YYYY-MM-DD strings, so clock changes can't shift a day count.
  function dateToUtc(date) {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function daysBetween(from, to) {
    return Math.round((dateToUtc(to) - dateToUtc(from)) / 86400000);
  }

  function addDays(date, days) {
    return new Date(dateToUtc(date) + days * 86400000).toISOString().slice(0, 10);
  }

  function localToday(now = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function createGrow(state, fields) {
    const number = state.nextGrowNumber++;
    const grow = {
      id: number,
      code: `Grow ${number}`,
      variety: fields.variety,
      seedGrams: fields.seedGrams,
      trayColour: fields.trayColour,
      medium: fields.medium,
      sownOn: fields.sownOn,
      plannedDays: { ...fields.plannedDays },
      status: 'growing',
      skippedBlackout: false,
      stages: [{ stage: 'germination', startedOn: fields.sownOn }],
      checks: [],
      water: [],
      notes: [],
      harvest: null,
      ended: null,
    };
    state.grows.push(grow);
    return grow;
  }

  function currentEntry(grow) {
    return grow.stages[grow.stages.length - 1];
  }

  function currentStage(grow) {
    return currentEntry(grow).stage;
  }

  function dayNumber(grow, today) {
    return daysBetween(grow.sownOn, today);
  }

  // A "not yet" answer replaces the planned date until the tray is moved. Moving
  // starts the next stage's countdown from the day it actually moved.
  function countdown(grow, today) {
    const stage = currentEntry(grow);
    const planned = addDays(stage.startedOn, grow.plannedDays[stage.stage]);
    const latestCheck = grow.checks
      .filter((c) => c.stage === stage.stage && c.on >= stage.startedOn)
      .pop();
    const dueOn = latestCheck ? latestCheck.recheckOn : planned;
    const daysLeft = daysBetween(today, dueOn);
    return {
      dueOn,
      daysLeft,
      isDue: daysLeft <= 0,
      overdueBy: Math.max(0, -daysLeft),
      rechecking: Boolean(latestCheck),
      next: TRANSITIONS[stage.stage].next,
      nextLabel: NEXT_LABEL[TRANSITIONS[stage.stage].next],
    };
  }

  function assertGrowing(grow) {
    if (grow.status !== 'growing') throw new Error(`${grow.code} has already finished.`);
  }

  function assertNotBeforeStage(grow, on) {
    if (on < currentEntry(grow).startedOn) {
      throw new Error(`That date is before this stage started (${currentEntry(grow).startedOn}).`);
    }
  }

  function moveToNext(grow, on, { skipBlackout = false } = {}) {
    assertGrowing(grow);
    assertNotBeforeStage(grow, on);
    const stage = currentStage(grow);
    if (stage === 'light') throw new Error('Use harvest to finish a tray in the light stage.');
    if (skipBlackout && stage !== 'germination') {
      throw new Error('Blackout can only be skipped from germination.');
    }
    grow.skippedBlackout = skipBlackout;
    grow.stages.push({
      stage: skipBlackout ? 'light' : TRANSITIONS[stage].next,
      startedOn: on,
    });
  }

  function notReady(grow, on, { recheckInDays = 1, note = '' } = {}) {
    assertGrowing(grow);
    if (!Number.isInteger(recheckInDays) || recheckInDays < 1) {
      throw new Error('Check again in at least 1 day.');
    }
    grow.checks.push({
      stage: currentStage(grow),
      on,
      recheckOn: addDays(on, recheckInDays),
      note,
    });
  }

  function harvest(grow, { on, grams = null, problems = [], notes = '' }) {
    assertGrowing(grow);
    assertNotBeforeStage(grow, on);
    if (currentStage(grow) !== 'light') throw new Error('Only a tray in the light stage can be harvested.');
    grow.status = 'harvested';
    grow.harvest = { on, grams, problems, notes };
  }

  function endGrow(grow, { on, reason = '' }) {
    assertGrowing(grow);
    assertNotBeforeStage(grow, on);
    grow.status = 'ended';
    grow.ended = { on, reason };
  }

  function undoLast(grow) {
    if (grow.status !== 'growing') {
      grow.status = 'growing';
      grow.harvest = null;
      grow.ended = null;
      return;
    }
    if (grow.stages.length < 2) throw new Error('There is no move to undo.');
    const undone = grow.stages.pop();
    if (undone.stage === 'light') grow.skippedBlackout = false;
  }

  function logWater(grow, on, ml) {
    if (!(ml > 0)) throw new Error('Enter the water in ml.');
    grow.water.push({ on, ml });
  }

  function totalWaterMl(grow) {
    return grow.water.reduce((sum, entry) => sum + entry.ml, 0);
  }

  function waterAdvice(grow, settings, today) {
    const stage = currentEntry(grow);
    if (grow.status !== 'growing' || stage.stage !== 'light') return { due: false };
    const { firstMl, topUpMinMl, topUpMaxMl } = settings.water;
    const sinceLight = grow.water.filter((w) => w.on >= stage.startedOn);
    if (sinceLight.length === 0) {
      return {
        due: true,
        text: `First bottom watering: about ${firstMl} ml in the bottom tray.`,
        suggestedMl: firstMl,
      };
    }
    if (sinceLight.some((w) => w.on === today)) {
      return { due: false, text: 'Watered today.' };
    }
    return {
      due: true,
      text: `Check the bottom tray. If it’s low, add ${topUpMinMl}–${topUpMaxMl} ml.`,
      suggestedMl: topUpMinMl,
    };
  }

  // What the tray really did, for comparing against the plan.
  function stageHistory(grow) {
    const finishedOn = grow.harvest ? grow.harvest.on : grow.ended ? grow.ended.on : null;
    return grow.stages.map((entry, i) => {
      const endedOn = i + 1 < grow.stages.length ? grow.stages[i + 1].startedOn : finishedOn;
      return {
        stage: entry.stage,
        startedOn: entry.startedOn,
        endedOn,
        plannedDays: grow.plannedDays[entry.stage],
        actualDays: endedOn ? daysBetween(entry.startedOn, endedOn) : null,
      };
    });
  }

  function gramsPerGramOfSeed(grow) {
    if (!grow.harvest || !grow.harvest.grams || !(grow.seedGrams > 0)) return null;
    return grow.harvest.grams / grow.seedGrams;
  }

  // Starts a new grow from what this variety actually did last time.
  function plannedDaysFor(state, variety) {
    const defaults = state.settings.plannedDays;
    const name = (variety || '').trim().toLowerCase();
    const last = state.grows
      .filter((g) => g.status === 'harvested' && g.variety.trim().toLowerCase() === name)
      .pop();
    if (!last) return { days: { ...defaults }, fromGrow: null };
    const days = { ...defaults };
    for (const item of stageHistory(last)) days[item.stage] = Math.max(1, item.actualDays);
    return { days, fromGrow: last };
  }

  function todayView(state, today) {
    const growing = state.grows.filter((g) => g.status === 'growing');
    const byDueDate = (a, b) => (countdown(a, today).dueOn < countdown(b, today).dueOn ? -1 : 1);
    return {
      checks: growing.filter((g) => countdown(g, today).isDue).sort(byDueDate),
      water: growing.filter((g) => waterAdvice(g, state.settings, today).due),
      growing: growing.slice().sort(byDueDate),
    };
  }

  const api = {
    STAGES, TRANSITIONS, DEFAULT_SETTINGS,
    newState, daysBetween, addDays, localToday, createGrow, currentStage, currentEntry,
    dayNumber, countdown, moveToNext, notReady, harvest, endGrow, undoLast, logWater,
    totalWaterMl, waterAdvice, stageHistory, gramsPerGramOfSeed, plannedDaysFor, todayView,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Grow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
