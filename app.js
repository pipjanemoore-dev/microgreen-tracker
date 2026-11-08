// Screens and event handling. All the grow rules live in logic.js.
(function () {
  const { STAGES, TRANSITIONS } = Grow;
  const STORAGE_KEY = 'microgreen-tracker';
  const PROBLEMS = ['Mould', 'Poor germination'];
  const app = document.getElementById('app');

  let state = load();
  let panel = null; // The open "not yet", harvest, early-move or end-grow form.
  let flash = '';
  let renderedOn = Grow.localToday();

  function load() {
    const fresh = Grow.newState();
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return fresh;
    try {
      const data = JSON.parse(saved);
      return { ...fresh, ...data, settings: { ...fresh.settings, ...data.settings } };
    } catch (error) {
      // Keep unreadable data rather than overwriting it on the next save.
      localStorage.setItem(`${STORAGE_KEY}-unreadable-${Date.now()}`, saved);
      flash = 'Your saved data could not be read. A copy was kept, and the app has started empty.';
      return fresh;
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
  const today = () => Grow.localToday();
  const findGrow = (id) => state.grows.find((g) => g.id === Number(id));
  const number = (value) => (value === '' || value == null ? null : Number(value));

  function formatDate(date) {
    return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  }

  function dot(colour) {
    const name = String(colour).toLowerCase();
    const style = CSS.supports('color', name) ? ` style="background:${esc(name)}"` : '';
    return `<span class="dot"${style} aria-hidden="true"></span>`;
  }

  function growTitle(grow, side = '') {
    return `<div class="grow-title">
      ${dot(grow.trayColour)}
      <h3>${esc(grow.code)} · ${esc(grow.variety)}</h3>
      <span class="subtle">${side || esc(grow.trayColour)}</span>
    </div>`;
  }

  function countdownText(count) {
    if (count.isDue) {
      return count.overdueBy
        ? { big: `${days(count.overdueBy)} overdue`, small: `Check for ${count.nextLabel}` }
        : { big: 'Check today', small: `Ready for ${count.nextLabel}?` };
    }
    return count.rechecking
      ? { big: days(count.daysLeft), small: `until the next ${count.nextLabel} check` }
      : { big: days(count.daysLeft), small: `until ${count.nextLabel}` };
  }

  // ---- Shared pieces ----

  function transitionPrompt(grow) {
    const stage = Grow.currentStage(grow);
    const step = TRANSITIONS[stage];
    const started = Grow.currentEntry(grow).startedOn;
    const isHarvest = step.next === 'harvest';
    const open = panel && panel.growId === grow.id ? panel.kind : null;

    const moveForm = isHarvest ? '' : `
      <form data-form="move" data-id="${grow.id}">
        <details>
          <summary>Moved on a different day?</summary>
          <label>Date moved
            <input type="date" name="on" value="${today()}" min="${started}" max="${today()}" required>
          </label>
        </details>
        <div class="actions stack">
          <button class="primary" name="intent" value="move">Yes, move to ${esc(step.next)}</button>
          ${stage === 'germination' ? '<button name="intent" value="skip">Skip blackout, move to light</button>' : ''}
          <button type="button" data-action="panel" data-kind="notyet" data-id="${grow.id}">Not yet</button>
        </div>
      </form>`;

    const harvestButtons = isHarvest ? `
      <div class="actions stack">
        <button class="primary" data-action="panel" data-kind="harvest" data-id="${grow.id}">Yes, harvest</button>
        <button data-action="panel" data-kind="notyet" data-id="${grow.id}">Not yet</button>
      </div>` : '';

    return `
      <p><strong>${esc(step.question)}</strong></p>
      <ul>${step.lookFor.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
      <p class="then">${esc(step.then)}</p>
      ${moveForm}${harvestButtons}
      ${open === 'notyet' ? notYetPanel(grow) : ''}
      ${open === 'harvest' ? harvestPanel(grow) : ''}`;
  }

  function notYetPanel(grow) {
    return `<form class="panel" data-form="notyet" data-id="${grow.id}">
      <label>Check again in
        <select name="recheck">
          <option value="1">1 day</option>
          <option value="2">2 days</option>
          <option value="3">3 days</option>
        </select>
      </label>
      <label>What did you see? <span class="hint">Optional, such as a cool room or low light</span>
        <input name="note" maxlength="300">
      </label>
      <button class="primary">Save, not ready yet</button>
    </form>`;
  }

  function harvestPanel(grow) {
    const started = Grow.currentEntry(grow).startedOn;
    return `<form class="panel" data-form="harvest" data-id="${grow.id}">
      <label>Harvest date
        <input type="date" name="on" value="${today()}" min="${started}" max="${today()}" required>
      </label>
      <label>Harvest weight (g)
        <input type="number" name="grams" min="0" step="0.1" inputmode="decimal">
      </label>
      <fieldset>
        <legend>Any problems?</legend>
        ${PROBLEMS.map((p) => `<label class="check-option">
          <input type="checkbox" name="problems" value="${esc(p)}">${esc(p)}
        </label>`).join('')}
      </fieldset>
      <label>Notes
        <textarea name="notes" maxlength="1000"></textarea>
      </label>
      <button class="primary">Save harvest</button>
    </form>`;
  }

  function waterForm(grow, advice) {
    return `<form class="inline-form" data-form="water" data-id="${grow.id}">
      <label>Water (ml)
        <input type="number" name="ml" min="1" step="1" inputmode="numeric" value="${esc(advice.suggestedMl || state.settings.water.topUpMinMl)}" required>
      </label>
      <button class="primary">Log water</button>
    </form>`;
  }

  // ---- Screens ----

  function renderToday() {
    const date = today();
    const view = Grow.todayView(state, date);
    let html = `<header class="page-head">
      <h1>Today</h1>
      <p class="subtle">${formatDate(date)}</p>
    </header>`;

    if (!view.growing.length) {
      return `${html}<div class="card empty">
        <p>No trays growing right now.</p>
        <a class="button primary" href="#/new">Start a grow</a>
      </div>`;
    }

    if (view.checks.length) {
      html += '<h2>Check these trays</h2>';
      html += view.checks.map((grow) => {
        const count = Grow.countdown(grow, date);
        const side = count.overdueBy ? `${days(count.overdueBy)} overdue` : `Day ${Grow.dayNumber(grow, date)}`;
        return `<article class="card check">${growTitle(grow, side)}${transitionPrompt(grow)}</article>`;
      }).join('');
    }

    if (view.water.length) {
      html += '<h2>Water</h2>';
      html += view.water.map((grow) => {
        const advice = Grow.waterAdvice(grow, state.settings, date);
        return `<article class="card water">${growTitle(grow)}<p>${esc(advice.text)}</p>${waterForm(grow, advice)}</article>`;
      }).join('');
    }

    html += '<h2>All growing trays</h2>';
    html += view.growing.map((grow) => {
      const count = Grow.countdown(grow, date);
      const text = countdownText(count);
      return `<a class="card row-link" href="#/grow/${grow.id}">
        <div class="row-main">
          ${growTitle(grow, ' ')}
          <span class="subtle">${esc(STAGES[Grow.currentStage(grow)].label)} · Day ${Grow.dayNumber(grow, date)}</span>
        </div>
        <div class="count ${count.isDue ? 'due' : ''}">
          <strong>${esc(text.big)}</strong><span>${esc(text.small)}</span>
        </div>
      </a>`;
    }).join('');

    return html;
  }

  function growForm(grow) {
    const { settings } = state;
    const isEdit = Boolean(grow);
    const values = grow || {
      variety: '', seedGrams: '', trayColour: settings.colours[0], medium: settings.mediums[0],
      sownOn: today(), plannedDays: settings.plannedDays,
    };
    const options = (list, selected) => {
      const all = list.includes(selected) ? list : [selected, ...list];
      return all.map((item) =>
        `<option${item === selected ? ' selected' : ''}>${esc(item)}</option>`).join('');
    };
    const varieties = [...new Set(state.grows.map((g) => g.variety))];

    return `<form data-form="${isEdit ? 'edit' : 'new'}" ${isEdit ? `data-id="${grow.id}"` : ''}>
      <label>Seed variety
        <input name="variety" list="varieties" value="${esc(values.variety)}" required maxlength="80" autocomplete="off">
        <datalist id="varieties">${varieties.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>
      </label>
      <label>Seed weight (g)
        <input type="number" name="seedGrams" min="0.1" step="0.1" inputmode="decimal" value="${esc(values.seedGrams)}" required>
      </label>
      <label>Tray colour
        <select name="trayColour">${options(settings.colours, values.trayColour)}</select>
      </label>
      <label>Growing medium
        <select name="medium">${options(settings.mediums, values.medium)}</select>
      </label>
      <label>Date sown
        <input type="date" name="sownOn" value="${esc(values.sownOn)}" max="${today()}" required>
      </label>
      <fieldset>
        <legend>Days planned for each stage</legend>
        <div class="fields-3">
          ${['germination', 'blackout', 'light'].map((stage) => `<label>${STAGES[stage].label}
            <input type="number" name="${stage}" min="1" max="60" step="1" inputmode="numeric" value="${esc(values.plannedDays[stage])}" required>
          </label>`).join('')}
        </div>
        <p class="subtle" id="plan-hint">Each countdown starts when you actually move the tray.</p>
      </fieldset>
      <div class="actions stack">
        <button class="primary">${isEdit ? 'Save changes' : 'Start grow'}</button>
      </div>
    </form>`;
  }

  function renderNew() {
    return `<header class="page-head">
      <h1>New grow</h1>
      <p class="subtle">This will be Grow ${state.nextGrowNumber}</p>
    </header>${growForm(null)}`;
  }

  function renderEdit(grow) {
    return `<a class="back" href="#/grow/${grow.id}">← ${esc(grow.code)}</a>
      <header class="page-head"><h1>Edit ${esc(grow.code)}</h1></header>
      ${growForm(grow)}`;
  }

  function renderGrow(grow) {
    const date = today();
    const growing = grow.status === 'growing';
    const open = panel && panel.growId === grow.id ? panel.kind : null;
    let html = `<a class="back" href="#/${growing ? 'today' : 'history'}">← ${growing ? 'Today' : 'History'}</a>
      <header class="page-head">
        <h1>${esc(grow.code)} · ${esc(grow.variety)}</h1>
        <p class="subtle">${growing ? `Day ${Grow.dayNumber(grow, date)}` : grow.status === 'harvested' ? 'Harvested' : 'Ended without harvest'}</p>
      </header>`;

    if (growing) {
      const count = Grow.countdown(grow, date);
      const text = countdownText(count);
      const stage = STAGES[Grow.currentStage(grow)];
      html += `<div class="hero ${count.isDue ? 'due' : ''}">
        <strong>${esc(text.big)}</strong>
        <span>${esc(text.small)}${count.isDue ? '' : ` (${formatDate(count.dueOn)})`}</span>
        <p><b>${esc(stage.label)}:</b> ${esc(stage.care)}</p>
      </div>`;

      if (count.isDue) {
        html += `<article class="card check">${transitionPrompt(grow)}</article>`;
      } else if (open) {
        html += `<article class="card check">${transitionPrompt(grow)}</article>`;
      } else {
        html += `<div class="actions" style="margin-bottom:10px">
          <button data-action="panel" data-kind="early" data-id="${grow.id}">Tray looks ready early?</button>
        </div>`;
      }

      if (Grow.currentStage(grow) === 'light') {
        const advice = Grow.waterAdvice(grow, state.settings, date);
        html += `<article class="card water"><p>${esc(advice.text)}</p>${waterForm(grow, advice)}</article>`;
      }
    }

    if (grow.harvest) {
      const ratio = Grow.gramsPerGramOfSeed(grow);
      html += `<article class="card"><dl class="facts">
        <div><dt>Harvested</dt><dd>${formatDate(grow.harvest.on)}</dd></div>
        <div><dt>Harvest weight</dt><dd>${grow.harvest.grams == null ? 'Not recorded' : `${esc(grow.harvest.grams)} g`}</dd></div>
        <div><dt>Yield per gram of seed</dt><dd>${ratio == null ? '–' : `${ratio.toFixed(1)} g`}</dd></div>
        <div><dt>Problems</dt><dd>${grow.harvest.problems.length ? esc(grow.harvest.problems.join(', ')) : 'None'}</dd></div>
      </dl>${grow.harvest.notes ? `<p style="margin:10px 0 0">${esc(grow.harvest.notes)}</p>` : ''}</article>`;
    }

    if (grow.ended) {
      html += `<article class="card"><p><strong>Ended ${formatDate(grow.ended.on)}</strong></p>
        ${grow.ended.reason ? `<p>${esc(grow.ended.reason)}</p>` : ''}</article>`;
    }

    html += `<h2>Details</h2><article class="card"><dl class="facts">
      <div><dt>Tray colour</dt><dd>${dot(grow.trayColour)} ${esc(grow.trayColour)}</dd></div>
      <div><dt>Date sown</dt><dd>${formatDate(grow.sownOn)}</dd></div>
      <div><dt>Seed weight</dt><dd>${esc(grow.seedGrams)} g</dd></div>
      <div><dt>Growing medium</dt><dd>${esc(grow.medium)}</dd></div>
      <div><dt>Total water</dt><dd>${Grow.totalWaterMl(grow)} ml</dd></div>
    </dl></article>`;

    html += `<h2>Stages</h2><article class="card"><table>
      <thead><tr><th>Stage</th><th>Started</th><th>Planned</th><th>Actual</th></tr></thead>
      <tbody>${Grow.stageHistory(grow).map((item) => `<tr>
        <td>${esc(STAGES[item.stage].label)}</td>
        <td>${formatDate(item.startedOn)}</td>
        <td>${days(item.plannedDays)}</td>
        <td>${item.actualDays == null ? 'Under way' : days(item.actualDays)}</td>
      </tr>`).join('')}
      ${grow.skippedBlackout ? '<tr><td colspan="4" class="subtle">Blackout skipped</td></tr>' : ''}
      </tbody></table></article>`;

    if (grow.checks.length) {
      html += `<h2>“Not yet” answers</h2><article class="card"><ul class="log">
        ${grow.checks.map((check) => `<li><span><b>${formatDate(check.on)}</b>, ${esc(STAGES[check.stage].label)}${check.note ? `: ${esc(check.note)}` : ''}</span></li>`).join('')}
      </ul></article>`;
    }

    if (grow.water.length) {
      html += `<h2>Water log</h2><article class="card"><ul class="log">
        ${grow.water.map((entry, i) => `<li><span>${formatDate(entry.on)}: ${esc(entry.ml)} ml</span>
          <button data-action="remove-water" data-id="${grow.id}" data-index="${i}" aria-label="Remove ${esc(entry.ml)} ml entry">Remove</button></li>`).join('')}
      </ul></article>`;
    }

    html += `<h2>Notes</h2><article class="card">
      ${grow.notes.length ? `<ul class="log" style="margin-bottom:12px">
        ${grow.notes.map((note, i) => `<li><span><b>${formatDate(note.on)}</b>: ${esc(note.text)}</span>
          <button data-action="remove-note" data-id="${grow.id}" data-index="${i}" aria-label="Remove note">Remove</button></li>`).join('')}
      </ul>` : ''}
      <form class="inline-form" data-form="note" data-id="${grow.id}">
        <label>Add a note <input name="text" required maxlength="500"></label>
        <button>Add</button>
      </form></article>`;

    const canUndo = !growing || grow.stages.length > 1;
    html += `<h2>Manage</h2><div class="actions">
      <a class="button" href="#/grow/${grow.id}/edit">Edit details</a>
      ${canUndo ? `<button data-action="undo" data-id="${grow.id}">${growing ? 'Undo last move' : 'Reopen grow'}</button>` : ''}
      ${growing ? `<button data-action="panel" data-kind="end" data-id="${grow.id}">End without harvest</button>` : ''}
      <button class="danger" data-action="delete" data-id="${grow.id}">Delete grow</button>
    </div>`;

    if (open === 'end') {
      html += `<form class="panel" data-form="end" data-id="${grow.id}">
        <label>What happened? <span class="hint">Optional</span>
          <input name="reason" maxlength="300">
        </label>
        <button class="primary">End this grow</button>
      </form>`;
    }
    return html;
  }

  function renderHistory() {
    const finished = state.grows.filter((g) => g.status !== 'growing').reverse();
    const head = '<header class="page-head"><h1>History</h1><p class="subtle">Finished grows, newest first</p></header>';
    if (!finished.length) {
      return `${head}<div class="card empty"><p>Finished grows will appear here.</p></div>`;
    }
    return head + finished.map((grow) => {
      const finishedOn = grow.harvest ? grow.harvest.on : grow.ended.on;
      const ratio = Grow.gramsPerGramOfSeed(grow);
      const problems = grow.harvest ? grow.harvest.problems : [];
      return `<a class="card row-link" href="#/grow/${grow.id}" style="display:block">
        ${growTitle(grow, formatDate(finishedOn))}
        ${grow.harvest ? `<dl class="facts">
          <div><dt>Seed → harvest</dt><dd>${esc(grow.seedGrams)} g → ${grow.harvest.grams == null ? '–' : `${esc(grow.harvest.grams)} g`}</dd></div>
          <div><dt>Yield per gram of seed</dt><dd>${ratio == null ? '–' : `${ratio.toFixed(1)} g`}</dd></div>
          <div><dt>Days from sowing</dt><dd>${Grow.daysBetween(grow.sownOn, finishedOn)}</dd></div>
          <div><dt>Water</dt><dd>${Grow.totalWaterMl(grow)} ml</dd></div>
        </dl>${problems.length ? `<p class="subtle" style="margin:8px 0 0">Problems: ${esc(problems.join(', '))}</p>` : ''}`
        : '<p class="subtle">Ended without harvest</p>'}
      </a>`;
    }).join('');
  }

  function renderSettings() {
    const { colours, mediums, plannedDays, water } = state.settings;
    return `<header class="page-head"><h1>Settings</h1></header>
      <form data-form="settings">
        <label>Tray colours <span class="hint">One per line</span>
          <textarea name="colours" rows="5">${esc(colours.join('\n'))}</textarea>
        </label>
        <label>Growing mediums <span class="hint">One per line</span>
          <textarea name="mediums" rows="3">${esc(mediums.join('\n'))}</textarea>
        </label>
        <fieldset>
          <legend>Default days for a new variety</legend>
          <div class="fields-3">
            ${['germination', 'blackout', 'light'].map((stage) => `<label>${STAGES[stage].label}
              <input type="number" name="${stage}" min="1" max="60" step="1" value="${esc(plannedDays[stage])}" required>
            </label>`).join('')}
          </div>
        </fieldset>
        <fieldset>
          <legend>Bottom watering (ml)</legend>
          <div class="fields-3">
            <label>First watering <input type="number" name="firstMl" min="1" value="${esc(water.firstMl)}" required></label>
            <label>Top-up, low <input type="number" name="topUpMinMl" min="1" value="${esc(water.topUpMinMl)}" required></label>
            <label>Top-up, high <input type="number" name="topUpMaxMl" min="1" value="${esc(water.topUpMaxMl)}" required></label>
          </div>
          <p class="subtle">Starting amounts converted from On The Grow’s 10x10 guide. Temperature, humidity and airflow all change what a tray needs, so adjust these to suit your trays.</p>
        </fieldset>
        <div class="actions stack"><button class="primary">Save settings</button></div>
      </form>
      <h2>Backup</h2>
      <article class="card">
        <p>Your grows are saved only in this browser. Download a backup now and then, because clearing browser data would erase them.</p>
        <div class="actions">
          <button data-action="export">Download backup</button>
          <label class="button" style="margin:0">Restore backup
            <input type="file" accept="application/json,.json" data-action="import" hidden>
          </label>
        </div>
      </article>`;
  }

  // ---- Routing ----

  function render() {
    renderedOn = today();
    const [route = 'today', id, sub] = location.hash.replace(/^#\/?/, '').split('/');
    let html;
    let tab = route;
    if (route === 'grow') {
      const grow = findGrow(id);
      tab = grow && grow.status !== 'growing' ? 'history' : 'today';
      html = !grow
        ? '<div class="card empty"><p>That grow doesn’t exist.</p><a href="#/today">Back to Today</a></div>'
        : sub === 'edit' ? renderEdit(grow) : renderGrow(grow);
    } else if (route === 'new') html = renderNew();
    else if (route === 'history') html = renderHistory();
    else if (route === 'settings') html = renderSettings();
    else { tab = 'today'; html = renderToday(); }

    app.innerHTML = (flash ? `<div class="flash" role="alert">${esc(flash)}</div>` : '') + html;
    flash = '';
    document.querySelectorAll('.tabs a').forEach((link) => {
      const active = link.dataset.tab === tab;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function go(hash) {
    panel = null;
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  // Saves the change, or shows the reason it was refused.
  function apply(change) {
    try {
      change();
      save();
      return true;
    } catch (error) {
      flash = error.message;
      return false;
    }
  }

  // ---- Forms ----

  function readGrowFields(data) {
    const fields = {
      variety: data.get('variety').trim(),
      seedGrams: number(data.get('seedGrams')),
      trayColour: data.get('trayColour'),
      medium: data.get('medium'),
      sownOn: data.get('sownOn'),
      plannedDays: {
        germination: number(data.get('germination')),
        blackout: number(data.get('blackout')),
        light: number(data.get('light')),
      },
    };
    if (!fields.variety) throw new Error('Enter a seed variety.');
    return fields;
  }

  function lines(value) {
    return [...new Set(value.split('\n').map((line) => line.trim()).filter(Boolean))];
  }

  const forms = {
    new(data) {
      let created;
      if (apply(() => { created = Grow.createGrow(state, readGrowFields(data)); })) go('#/today');
      else render();
      return created;
    },
    edit(data, grow) {
      const ok = apply(() => {
        const fields = readGrowFields(data);
        const nextStage = grow.stages[1];
        if (nextStage && fields.sownOn > nextStage.startedOn) {
          throw new Error('The sowing date can’t be after the tray moved to its next stage.');
        }
        Object.assign(grow, fields);
        grow.stages[0].startedOn = fields.sownOn;
      });
      if (ok) go(`#/grow/${grow.id}`);
      else render();
    },
    move(data, grow, submitter) {
      const skipBlackout = submitter && submitter.value === 'skip';
      apply(() => Grow.moveToNext(grow, data.get('on'), { skipBlackout }));
      panel = null;
      render();
    },
    notyet(data, grow) {
      apply(() => Grow.notReady(grow, today(), {
        recheckInDays: number(data.get('recheck')),
        note: data.get('note').trim(),
      }));
      panel = null;
      render();
    },
    harvest(data, grow) {
      const ok = apply(() => Grow.harvest(grow, {
        on: data.get('on'),
        grams: number(data.get('grams')),
        problems: data.getAll('problems'),
        notes: data.get('notes').trim(),
      }));
      panel = null;
      if (ok) go(`#/grow/${grow.id}`);
      else render();
    },
    end(data, grow) {
      apply(() => Grow.endGrow(grow, { on: today(), reason: data.get('reason').trim() }));
      panel = null;
      render();
    },
    water(data, grow) {
      apply(() => Grow.logWater(grow, today(), number(data.get('ml'))));
      render();
    },
    note(data, grow) {
      const text = data.get('text').trim();
      if (text) apply(() => grow.notes.push({ on: today(), text }));
      render();
    },
    settings(data) {
      const colours = lines(data.get('colours'));
      const mediums = lines(data.get('mediums'));
      const low = number(data.get('topUpMinMl'));
      const high = number(data.get('topUpMaxMl'));
      if (!colours.length || !mediums.length) flash = 'Keep at least one tray colour and one growing medium.';
      else if (low > high) flash = 'The low top-up amount can’t be more than the high amount.';
      else {
        apply(() => {
          state.settings = {
            colours,
            mediums,
            plannedDays: {
              germination: number(data.get('germination')),
              blackout: number(data.get('blackout')),
              light: number(data.get('light')),
            },
            water: { firstMl: number(data.get('firstMl')), topUpMinMl: low, topUpMaxMl: high },
          };
        });
      }
      render();
      if (!document.querySelector('.flash')) {
        const button = app.querySelector('form[data-form="settings"] button.primary');
        button.textContent = 'Saved';
      }
    },
  };

  app.addEventListener('submit', (event) => {
    const form = event.target;
    const handler = forms[form.dataset.form];
    if (!handler) return;
    event.preventDefault();
    handler(new FormData(form), findGrow(form.dataset.id), event.submitter);
  });

  // ---- Buttons ----

  const actions = {
    panel(el, grow) {
      const kind = el.dataset.kind;
      if (kind === 'early') {
        // Shows the same readiness question ahead of the countdown.
        panel = { growId: grow.id, kind: 'early' };
      } else {
        const closing = panel && panel.growId === grow.id && panel.kind === kind;
        panel = closing ? null : { growId: grow.id, kind };
      }
      render();
    },
    undo(el, grow) {
      apply(() => Grow.undoLast(grow));
      panel = null;
      render();
    },
    delete(el, grow) {
      if (!confirm(`Delete ${grow.code} (${grow.variety})? This can’t be undone.`)) return;
      state.grows = state.grows.filter((g) => g !== grow);
      save();
      go('#/today');
    },
    'remove-water'(el, grow) {
      grow.water.splice(Number(el.dataset.index), 1);
      save();
      render();
    },
    'remove-note'(el, grow) {
      grow.notes.splice(Number(el.dataset.index), 1);
      save();
      render();
    },
    export() {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `microgreen-tracker-backup-${today()}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    },
  };

  app.addEventListener('click', (event) => {
    const el = event.target.closest('button[data-action]');
    if (!el) return;
    actions[el.dataset.action](el, findGrow(el.dataset.id));
  });

  app.addEventListener('change', async (event) => {
    const el = event.target;

    if (el.dataset.action === 'import' && el.files[0]) {
      try {
        const data = JSON.parse(await el.files[0].text());
        if (!Array.isArray(data.grows) || !data.settings || !data.nextGrowNumber) {
          throw new Error('not a backup');
        }
        if (confirm(`Replace everything in this browser with this backup (${data.grows.length} grows)?`)) {
          state = data;
          save();
        }
      } catch (error) {
        flash = 'That file isn’t a Microgreen Tracker backup.';
      }
      render();
      return;
    }

    // A variety you've grown before starts from how long it really took.
    if (el.name === 'variety' && el.form && el.form.dataset.form === 'new') {
      const { days: planned, fromGrow } = Grow.plannedDaysFor(state, el.value);
      for (const stage of ['germination', 'blackout', 'light']) {
        el.form.elements[stage].value = planned[stage];
      }
      el.form.querySelector('#plan-hint').textContent = fromGrow
        ? `Based on ${fromGrow.code}, your last ${fromGrow.variety} harvest. Change these if you like.`
        : 'Each countdown starts when you actually move the tray.';
    }
  });

  window.addEventListener('hashchange', () => { panel = null; render(); });

  // Rolls the countdowns over if the app is left open past midnight, without
  // wiping a half-filled form on any other return to the tab.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && today() !== renderedOn) render();
  });

  // The phone holds the only copy, so ask the browser not to clear it to free up space.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

  render();
})();
