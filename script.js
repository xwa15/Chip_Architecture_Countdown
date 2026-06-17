const state = {
  conferences: [],
  filtered: [],
  now: new Date()
};

const fmtDate = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const fmtDateTime = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

function parseDate(value) {
  return new Date(value);
}

function getNextDeadline(conf) {
  const upcoming = conf.deadlines
    .map(d => ({ ...d, date: parseDate(d.datetime) }))
    .filter(d => d.date > state.now)
    .sort((a, b) => a.date - b.date);
  return upcoming[0] || null;
}

function getLastDeadline(conf) {
  return conf.deadlines
    .map(d => ({ ...d, date: parseDate(d.datetime) }))
    .sort((a, b) => b.date - a.date)[0] || null;
}

function diffParts(target) {
  let ms = target - state.now;
  const past = ms < 0;
  ms = Math.abs(ms);
  const days = Math.floor(ms / 86400000);
  ms %= 86400000;
  const hours = Math.floor(ms / 3600000);
  ms %= 3600000;
  const minutes = Math.floor(ms / 60000);
  return { past, days, hours, minutes };
}

function renderCountdown(conf) {
  const next = getNextDeadline(conf);
  const last = getLastDeadline(conf);
  const target = next || last;
  if (!target) return { text: 'No deadline configured', cls: 'closed' };
  const diff = diffParts(target.date);
  if (diff.past) return { text: `${target.label} closed ${diff.days}d ${diff.hours}h ago`, cls: 'closed' };
  const cls = diff.days < 14 ? 'soon' : '';
  return { text: `${target.label}: ${diff.days}d ${diff.hours}h ${diff.minutes}m left`, cls };
}

function deadlineStatus(conf) {
  return getNextDeadline(conf) ? 'upcoming' : 'closed';
}

function applyFilters() {
  const query = document.querySelector('#searchInput').value.trim().toLowerCase();
  const area = document.querySelector('#areaFilter').value;
  const status = document.querySelector('#statusFilter').value;

  state.filtered = state.conferences.filter(conf => {
    const text = [conf.name, conf.fullName, conf.location, conf.area, ...(conf.tags || [])].join(' ').toLowerCase();
    const queryOk = !query || text.includes(query);
    const areaOk = area === 'all' || conf.area === area;
    const statusOk = status === 'all' || deadlineStatus(conf) === status;
    return queryOk && areaOk && statusOk;
  }).sort((a, b) => {
    const da = getNextDeadline(a)?.date || new Date('2999-01-01');
    const db = getNextDeadline(b)?.date || new Date('2999-01-01');
    return da - db || a.name.localeCompare(b.name);
  });
  render();
}

function render() {
  const grid = document.querySelector('#cards');
  const tmpl = document.querySelector('#confCardTemplate');
  grid.replaceChildren();

  if (!state.filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty card';
    empty.textContent = 'No conferences match the current filters.';
    grid.appendChild(empty);
    return;
  }

  for (const conf of state.filtered) {
    const node = tmpl.content.cloneNode(true);
    const card = node.querySelector('.card');
    const title = node.querySelector('h2');
    const full = node.querySelector('.full-name');
    const pill = node.querySelector('.pill');
    const meta = node.querySelector('.meta');
    const countdown = node.querySelector('.countdown');
    const deadlines = node.querySelector('.deadlines');
    const note = node.querySelector('.note');
    const links = node.querySelector('.links');

    const next = getNextDeadline(conf);
    const cd = renderCountdown(conf);

    title.textContent = `${conf.name} ${conf.year}`;
    full.textContent = conf.fullName;
    pill.textContent = next ? 'Upcoming' : 'Closed';
    if (!next) pill.classList.add('closed');
    meta.innerHTML = `📍 ${conf.location}<br>🗓️ ${fmtDate.format(parseDate(conf.conferenceStart))} – ${fmtDate.format(parseDate(conf.conferenceEnd))}`;
    countdown.textContent = cd.text;
    countdown.className = `countdown ${cd.cls}`;
    note.textContent = conf.statusNote || '';

    for (const d of conf.deadlines.map(d => ({ ...d, date: parseDate(d.datetime) })).sort((a, b) => a.date - b.date)) {
      const row = document.createElement('div');
      row.className = 'deadline-row';
      const left = document.createElement('div');
      left.innerHTML = `<strong>${d.label}</strong><small>${d.displayTime || fmtDateTime.format(d.date)}</small>`;
      const right = document.createElement('div');
      right.textContent = d.date > state.now ? 'open' : 'closed';
      row.append(left, right);
      deadlines.appendChild(row);
    }

    (conf.sources || []).forEach((href, idx) => {
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = `Source ${idx + 1}`;
      links.appendChild(a);
    });

    grid.appendChild(card);
  }
  renderHero();
}

function renderHero() {
  const allUpcoming = state.conferences
    .map(conf => ({ conf, d: getNextDeadline(conf) }))
    .filter(x => x.d)
    .sort((a, b) => a.d.date - b.d.date);
  const name = document.querySelector('#nextDeadlineName');
  const countdown = document.querySelector('#nextDeadlineCountdown');
  if (!allUpcoming.length) {
    name.textContent = 'No upcoming deadlines';
    countdown.textContent = 'Add the next cycle to conferences.json';
    return;
  }
  const first = allUpcoming[0];
  const diff = diffParts(first.d.date);
  name.textContent = `${first.conf.name} ${first.year} — ${first.d.label}`;
  countdown.textContent = `${diff.days}d ${diff.hours}h ${diff.minutes}m left`;
}

function exportICS() {
  const upcoming = state.conferences.flatMap(conf => conf.deadlines.map(d => ({ conf, d, date: parseDate(d.datetime) }))).filter(x => x.date > state.now);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Chip Conference Countdown//EN'];
  for (const { conf, d, date } of upcoming) {
    const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${conf.id}-${d.type}-${stamp}@chip-conf-countdown`);
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`);
    lines.push(`DTSTART:${stamp}`);
    lines.push(`SUMMARY:${conf.name} ${conf.year}: ${d.label}`);
    lines.push(`DESCRIPTION:${conf.fullName}\\n${d.displayTime || ''}\\n${(conf.sources || []).join('\\n')}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'chip-conference-deadlines.ics';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function init() {
  const res = await fetch('data/conferences.json');
  state.conferences = await res.json();
  applyFilters();
  for (const id of ['searchInput', 'areaFilter', 'statusFilter']) {
    document.querySelector(`#${id}`).addEventListener('input', applyFilters);
  }
  document.querySelector('#exportBtn').addEventListener('click', exportICS);
  setInterval(() => {
    state.now = new Date();
    render();
  }, 60000);
}

init().catch(err => {
  document.querySelector('#cards').innerHTML = `<div class="empty card">Failed to load data: ${err.message}</div>`;
});
