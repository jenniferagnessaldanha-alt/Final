'use strict';

/* ================================================================
   SETTINGS
   Change the organiser PIN here. (Front-end only: fine for a course
   project, but real apps must check PINs on a server.)
================================================================ */
const ORGANISER_PIN = '2468';
const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 30;

/* ---------- State ---------- */
const STORAGE_KEY = 'workshopFeedback.v1';
let feedbackList = loadFeedback();
let unlocked = false;          // resets on every page refresh
let failedAttempts = 0;
let lockedUntil = 0;

const RATING_WORDS = { 1: 'Very poor', 2: 'Poor', 3: 'Average', 4: 'Good', 5: 'Excellent' };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Element references ---------- */
const $ = (id) => document.getElementById(id);
const form = $('feedback-form');
const eventInput = $('eventName');
const nameInput = $('participant');
const anonBox = $('anonymous');
const commentsInput = $('comments');
const counter = $('counter');
const starsBox = $('stars');
const badge = $('ratingBadge');
const eventFilter = $('eventFilter');
const ratingFilter = $('ratingFilter');
const sortBy = $('sortBy');
const feed = $('feed');
const toastEl = $('toast');
const pinDialog = $('pinDialog');
const pinInput = $('pinInput');
const pinError = $('pinError');

/* ---------- Storage ---------- */
function loadFeedback() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

function saveFeedback() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(feedbackList));
  } catch (err) {
    showToast('Could not save data in this browser.');
  }
}

/* ---------- Helpers ---------- */
function starsText(n) {
  let out = '';
  for (let i = 1; i <= 5; i++) {
    out += i <= n ? '<span>\u2605</span>' : '<span class="off">\u2605</span>';
  }
  return out;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function normalise(text) {
  return text.trim().replace(/\s+/g, ' ');
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove('show'), 2500);
}

function setError(field, message) {
  $(field + '-error').textContent = message;
  const input = { eventName: eventInput, participant: nameInput, comments: commentsInput }[field];
  if (input) input.classList.toggle('invalid', Boolean(message));
}

function clearErrors() {
  ['eventName', 'participant', 'rating', 'comments'].forEach((f) => setError(f, ''));
}

function getSelectedRating() {
  const checked = form.querySelector('input[name="rating"]:checked');
  return checked ? Number(checked.value) : 0;
}

/* ================================================================
   STAR POP + GLITTER
================================================================ */
function glitterBurst(label) {
  if (reduceMotion) return;
  const boxRect = starsBox.getBoundingClientRect();
  const r = label.getBoundingClientRect();
  const cx = r.left - boxRect.left + r.width / 2;
  const cy = r.top - boxRect.top + r.height / 2;

  for (let i = 0; i < 12; i++) {
    const spark = document.createElement('span');
    spark.className = 'spark';
    spark.textContent = i % 3 === 0 ? '\u2726' : '\u2727';
    const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
    const dist = 28 + Math.random() * 34;
    spark.style.left = cx + 'px';
    spark.style.top = cy + 'px';
    spark.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    spark.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
    spark.style.fontSize = 0.6 + Math.random() * 0.7 + 'rem';
    spark.addEventListener('animationend', () => spark.remove());
    starsBox.appendChild(spark);
  }
}

function popStars(rating) {
  const labels = [...starsBox.querySelectorAll('label')];
  labels.forEach((label) => {
    const value = Number(label.htmlFor.replace('r', ''));
    label.classList.remove('pop');
    if (value <= rating) {
      void label.offsetWidth;                       // restart animation
      label.style.animationDelay = (value - 1) * 70 + 'ms';
      label.classList.add('pop');
    }
    if (value === rating) glitterBurst(label);
  });
}

function updateRatingBadge(rating) {
  $('rbNum').textContent = rating;
  $('rbWord').textContent = rating ? RATING_WORDS[rating] : 'Tap a star';
  badge.classList.toggle('has-rating', rating > 0);
  badge.classList.remove('bump');
  void badge.offsetWidth;
  if (rating) badge.classList.add('bump');
}

form.addEventListener('change', (e) => {
  if (e.target.name === 'rating') {
    const r = getSelectedRating();
    updateRatingBadge(r);
    popStars(r);
    setError('rating', '');
  }
});

/* ================================================================
   FORM VALIDATION + SUBMIT
================================================================ */
function validate() {
  clearErrors();
  let firstBad = null;
  const fail = (field, msg, el) => { setError(field, msg); if (!firstBad) firstBad = el; };

  const eventName = normalise(eventInput.value);
  if (!eventName) fail('eventName', 'Enter the workshop name.', eventInput);
  else if (eventName.length < 3) fail('eventName', 'Workshop name must be at least 3 characters.', eventInput);

  if (!anonBox.checked) {
    const name = normalise(nameInput.value);
    if (!name) fail('participant', 'Enter your name, or tick "Submit anonymously".', nameInput);
    else if (name.length < 2) fail('participant', 'Name must be at least 2 characters.', nameInput);
    else if (!/^[A-Za-z][A-Za-z .'-]*$/.test(name)) fail('participant', 'Use letters, spaces, . - or \' only.', nameInput);
  }

  const rating = getSelectedRating();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    fail('rating', 'Choose a rating from 1 to 5 stars.', form.querySelector('input[name="rating"]'));
  }

  const comments = normalise(commentsInput.value);
  if (!comments) fail('comments', 'Add a short comment.', commentsInput);
  else if (comments.length < 10) fail('comments', 'Comment must be at least 10 characters.', commentsInput);

  if (firstBad) firstBad.focus();
  return !firstBad;
}

anonBox.addEventListener('change', () => {
  const anon = anonBox.checked;
  nameInput.disabled = anon;
  $('nameReq').style.display = anon ? 'none' : '';
  if (anon) { nameInput.value = ''; setError('participant', ''); }
});

function autoGrow() {
  commentsInput.style.height = 'auto';
  commentsInput.style.height = Math.min(commentsInput.scrollHeight + 2, 352) + 'px';
}

commentsInput.addEventListener('input', () => {
  const len = commentsInput.value.length;
  counter.textContent = len + ' / 300';
  counter.classList.toggle('near', len >= 270);
  autoGrow();
});

$('chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const add = chip.dataset.text;
  const current = commentsInput.value.trim();
  const next = current ? current + ' ' + add : add;
  if (next.length > 300) { showToast('Comment is at the 300 character limit.'); return; }
  commentsInput.value = next;
  commentsInput.dispatchEvent(new Event('input'));
  commentsInput.focus();
  setError('comments', '');
});

[eventInput, nameInput, commentsInput].forEach((input) => {
  input.addEventListener('input', () => {
    const key = input === eventInput ? 'eventName' : input === nameInput ? 'participant' : 'comments';
    if (input.classList.contains('invalid')) setError(key, '');
  });
});

function resetForm() {
  form.reset();
  nameInput.disabled = false;
  $('nameReq').style.display = '';
  counter.textContent = '0 / 300';
  counter.classList.remove('near');
  commentsInput.style.height = '';
  updateRatingBadge(0);
  starsBox.querySelectorAll('label').forEach((l) => l.classList.remove('pop'));
  clearErrors();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validate()) return;

  const entry = {
    id: Date.now() + Math.random().toString(16).slice(2, 6),
    eventName: normalise(eventInput.value),
    participant: anonBox.checked ? 'Anonymous' : normalise(nameInput.value),
    anonymous: anonBox.checked,
    rating: getSelectedRating(),
    comments: normalise(commentsInput.value),
    createdAt: Date.now()
  };
  feedbackList.push(entry);
  saveFeedback();

  showThanks(entry);
  resetForm();
  if (unlocked) { refreshEventOptions(); renderDashboard(); }
});

/* ---------- Thank-you card (participants never see results) ---------- */
function showThanks(entry) {
  $('thanksBadge').textContent = entry.rating;
  $('thanksTitle').textContent = entry.anonymous ? 'Thank you!' : 'Thank you, ' + entry.participant.split(' ')[0] + '!';
  $('thanksText').textContent = 'Your ' + entry.rating + '-star feedback for "' + entry.eventName + '" was sent to the organisers.';
  $('formCard').hidden = true;
  $('thanksCard').hidden = false;
  $('thanksCard').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
}

$('againBtn').addEventListener('click', () => {
  $('thanksCard').hidden = true;
  $('formCard').hidden = false;
  eventInput.focus();
});

/* ================================================================
   ORGANISER PIN
================================================================ */
$('openLock').addEventListener('click', () => {
  pinInput.value = '';
  pinError.textContent = '';
  pinDialog.showModal();
  pinInput.focus();
});

$('pinCancel').addEventListener('click', () => pinDialog.close());

$('pinForm').addEventListener('submit', (e) => {
  e.preventDefault();

  const wait = Math.ceil((lockedUntil - Date.now()) / 1000);
  if (wait > 0) {
    pinError.textContent = 'Too many wrong attempts. Try again in ' + wait + 's.';
    return;
  }

  const entered = pinInput.value.trim();
  if (!entered) { pinError.textContent = 'Enter the PIN.'; pinInput.focus(); return; }

  if (entered === ORGANISER_PIN) {
    failedAttempts = 0;
    pinDialog.close();
    unlockDashboard();
  } else {
    failedAttempts++;
    pinInput.value = '';
    if (failedAttempts >= MAX_ATTEMPTS) {
      lockedUntil = Date.now() + LOCKOUT_SECONDS * 1000;
      failedAttempts = 0;
      pinError.textContent = 'Wrong PIN. Locked for ' + LOCKOUT_SECONDS + ' seconds.';
    } else {
      pinError.textContent = 'Wrong PIN. ' + (MAX_ATTEMPTS - failedAttempts) + ' attempt(s) left.';
    }
    pinDialog.classList.remove('shake');
    void pinDialog.offsetWidth;
    pinDialog.classList.add('shake');
    pinInput.focus();
  }
});

function unlockDashboard() {
  unlocked = true;
  $('openLock').hidden = true;
  $('dashboard').hidden = false;
  refreshEventOptions();
  renderDashboard();
  showToast('Organiser view unlocked.');
  $('dashboard').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

function lockDashboard() {
  unlocked = false;
  $('dashboard').hidden = true;
  $('openLock').hidden = false;
  feed.innerHTML = '';
  $('dist').innerHTML = '';
  showToast('Summary locked.');
}

$('lockBtn').addEventListener('click', lockDashboard);

/* ---------- Organiser tools ---------- */
$('loadSample').addEventListener('click', () => {
  const now = Date.now();
  const sample = [
    ['Intro to JavaScript', 'Asha Verma', 5, 'Clear examples and the live coding made DOM events easy to follow.'],
    ['Intro to JavaScript', 'Rohan Iyer', 4, 'Good pace overall. More practice time on arrays would help.'],
    ['Intro to JavaScript', null, 3, 'Content was fine but the room was too crowded to see the screen.'],
    ['Git & GitHub Basics', 'Meera Nair', 5, 'Branching finally makes sense. The merge conflict demo was great.'],
    ['Git & GitHub Basics', null, 2, 'Too many commands in a short time. Needed a cheat sheet.'],
    ['Responsive Web Design', 'Karan Shah', 4, 'Flexbox and grid sections were useful. Loved the mobile-first tips.']
  ];
  sample.forEach((s, i) => {
    feedbackList.push({
      id: 'sample' + now + i,
      eventName: s[0],
      participant: s[1] || 'Anonymous',
      anonymous: !s[1],
      rating: s[2],
      comments: s[3],
      createdAt: now - (sample.length - i) * 3600000
    });
  });
  saveFeedback();
  refreshEventOptions();
  renderDashboard();
  showToast('Sample feedback added.');
});

$('clearAll').addEventListener('click', () => {
  if (!feedbackList.length) { showToast('Nothing to clear.'); return; }
  if (confirm('Delete all feedback? This cannot be undone.')) {
    feedbackList = [];
    saveFeedback();
    refreshEventOptions();
    renderDashboard();
    showToast('All feedback cleared.');
  }
});

function refreshEventOptions() {
  const events = [...new Set(feedbackList.map((f) => f.eventName))].sort((a, b) => a.localeCompare(b));
  const current = eventFilter.value || 'all';

  eventFilter.innerHTML = '';
  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = 'All workshops';
  eventFilter.appendChild(all);
  events.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    eventFilter.appendChild(opt);
  });
  eventFilter.value = events.includes(current) ? current : 'all';
}

[eventFilter, ratingFilter, sortBy].forEach((el) => el.addEventListener('change', renderDashboard));

/* ================================================================
   RENDERING (only runs while the organiser view is unlocked)
================================================================ */
function getEventScope() {
  return eventFilter.value === 'all'
    ? feedbackList
    : feedbackList.filter((f) => f.eventName === eventFilter.value);
}

function renderSummary(scope) {
  const total = scope.length;
  const sum = scope.reduce((acc, f) => acc + f.rating, 0);
  const avg = total ? sum / total : 0;

  $('avgNum').textContent = total ? avg.toFixed(1) : '\u2013';
  $('avgStars').innerHTML = starsText(total ? Math.round(avg) : 0);
  $('avgMeta').textContent = total
    ? 'Average from ' + total + (total === 1 ? ' response' : ' responses')
    : 'No ratings yet';

  const dist = $('dist');
  dist.innerHTML = '';
  for (let star = 5; star >= 1; star--) {
    const n = scope.filter((f) => f.rating === star).length;
    const pct = total ? Math.round((n / total) * 100) : 0;

    const row = document.createElement('div');
    row.className = 'dist-row';

    const label = document.createElement('span');
    label.className = 'dist-label';
    label.textContent = star + ' star' + (star > 1 ? 's' : '');

    const track = document.createElement('div');
    track.className = 'dist-track';
    const bar = document.createElement('div');
    bar.className = 'dist-bar';
    bar.style.width = pct + '%';
    track.appendChild(bar);

    const num = document.createElement('span');
    num.className = 'dist-num';
    num.textContent = n + ' (' + pct + '%)';

    row.append(label, track, num);
    dist.appendChild(row);
  }
}

function renderFeed(scope) {
  let items = scope.slice();

  if (ratingFilter.value !== 'all') {
    items = items.filter((f) => f.rating === Number(ratingFilter.value));
  }

  if (sortBy.value === 'high') items.sort((a, b) => b.rating - a.rating || b.createdAt - a.createdAt);
  else if (sortBy.value === 'low') items.sort((a, b) => a.rating - b.rating || b.createdAt - a.createdAt);
  else items.sort((a, b) => b.createdAt - a.createdAt);

  $('listCount').textContent = items.length;
  feed.innerHTML = '';

  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    const strong = document.createElement('strong');
    const p = document.createElement('span');
    if (!feedbackList.length) {
      strong.textContent = 'No feedback yet';
      p.textContent = 'Responses will show here after participants submit the form.';
    } else {
      strong.textContent = 'No feedback matches these filters';
      p.textContent = 'Try a different workshop or rating.';
    }
    li.append(strong, p);
    feed.appendChild(li);
    return;
  }

  items.forEach((f) => {
    const li = document.createElement('li');
    li.className = 'item';

    const top = document.createElement('div');
    top.className = 'item-top';
    const title = document.createElement('p');
    title.className = 'item-event';
    title.textContent = f.eventName;
    const stars = document.createElement('span');
    stars.className = 'item-stars';
    stars.innerHTML = starsText(f.rating);
    stars.setAttribute('role', 'img');
    stars.setAttribute('aria-label', f.rating + ' out of 5 stars, ' + RATING_WORDS[f.rating]);
    top.append(title, stars);

    const comment = document.createElement('p');
    comment.className = 'item-comment';
    comment.textContent = f.comments;

    const foot = document.createElement('div');
    foot.className = 'item-foot';
    const who = document.createElement('span');
    who.textContent = f.participant + ' \u2022 ' + formatDate(f.createdAt);
    if (f.anonymous) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'Anonymous';
      who.appendChild(tag);
    }
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete';
    del.textContent = 'Delete';
    del.setAttribute('aria-label', 'Delete feedback from ' + f.participant + ' for ' + f.eventName);
    del.addEventListener('click', () => deleteFeedback(f.id));
    foot.append(who, del);

    li.append(top, comment, foot);
    feed.appendChild(li);
  });
}

function deleteFeedback(id) {
  feedbackList = feedbackList.filter((f) => f.id !== id);
  saveFeedback();
  refreshEventOptions();
  renderDashboard();
  showToast('Feedback deleted.');
}

function renderDashboard() {
  if (!unlocked) return;
  const scope = getEventScope();
  renderSummary(scope);
  renderFeed(scope);
}