(function () {
  'use strict';

  const INTERVALS = [1, 2, 4, 7, 15, 30, 60, 90, 180, 365];
  const STORAGE_KEY = 'ebbinghaus_books';
  const SETTINGS_KEY = 'ebbinghaus_settings';
  const ALL_INTERVALS = [0, ...INTERVALS];

  const DEFAULT_SETTINGS = { booksPerDay: 3, minutesPerBook: 30 };

  function fmtDate(d) {
    const date = d instanceof Date ? d : new Date(d + 'T00:00:00');
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function addDays(base, n) {
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return fmtDate(d);
  }

  function diffDays(a, b) {
    const da = new Date(a + 'T00:00:00');
    const db = new Date(b + 'T00:00:00');
    return Math.floor((db - da) / (1000 * 60 * 60 * 24));
  }

  function today() { return fmtDate(new Date()); }
  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function phaseLabel(interval) { return interval === 0 ? '首次' : `第${interval}天复习`; }

  function loadSettings() {
    try { const raw = localStorage.getItem(SETTINGS_KEY); return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS; }
    catch (e) { return DEFAULT_SETTINGS; }
  }
  function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
  let settings = loadSettings();

  function loadBooks() {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
    catch (e) { return []; }
  }
  function saveBooks(books) { localStorage.setItem(STORAGE_KEY, JSON.stringify(books)); }
  let books = loadBooks();

  function getBookReviewDates(book) {
    const offsets = book.reviewOffsets || ALL_INTERVALS.map(() => 0);
    return ALL_INTERVALS.map((iv, i) => addDays(book.startDate, iv + offsets[i]));
  }

  function getTaskCountMap(excludeId) {
    const map = {};
    for (const book of books) {
      if (excludeId && book.id === excludeId) continue;
      getBookReviewDates(book).forEach(d => { map[d] = (map[d] || 0) + 1; });
    }
    return map;
  }

  function computeReviewOffsets(startDate, excludeId) {
    const map = getTaskCountMap(excludeId);
    const offsets = [];
    for (let i = 0; i < ALL_INTERVALS.length; i++) {
      let offset = 0;
      let date = addDays(startDate, ALL_INTERVALS[i]);
      while ((map[date] || 0) >= settings.booksPerDay && offset < 2) {
        offset++;
        date = addDays(startDate, ALL_INTERVALS[i] + offset);
      }
      map[date] = (map[date] || 0) + 1;
      offsets.push(offset);
    }
    return offsets;
  }

  function findBestStartDate(preferred, excludeId) {
    const map = getTaskCountMap(excludeId);
    for (let offset = 0; offset < 60; offset++) {
      const d = addDays(preferred, offset);
      if ((map[d] || 0) < settings.booksPerDay) return d;
    }
    return preferred;
  }

  function getReviewsForDate(date) {
    const list = [];
    for (const book of books) {
      const dates = getBookReviewDates(book);
      for (let i = 0; i < dates.length; i++) {
        if (dates[i] === date) {
          const interval = ALL_INTERVALS[i];
          const key = `${interval}`;
          const completed = (book.completedReviews || []).includes(key);
          list.push({ book, interval, phase: phaseLabel(interval), title: book.title, completed, reviewKey: key });
        }
      }
    }
    return list;
  }

  function getNextReview(book) {
    const td = today();
    const dates = getBookReviewDates(book);
    for (let i = 0; i < dates.length; i++) {
      const key = `${ALL_INTERVALS[i]}`;
      if (!(book.completedReviews || []).includes(key) && dates[i] >= td) {
        return { date: dates[i], interval: ALL_INTERVALS[i] };
      }
    }
    return null;
  }

  function getBookProgress(book) {
    return { done: (book.completedReviews || []).length, total: ALL_INTERVALS.length };
  }

  const pages = { today: 'page-today', books: 'page-books', calendar: 'page-calendar', settings: 'page-settings' };
  function switchPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pages[name]).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === name));
    if (name === 'today') renderToday();
    if (name === 'books') renderBooks();
    if (name === 'calendar') renderCalendar();
    if (name === 'settings') renderSettings();
  }
  document.querySelectorAll('.nav-item').forEach(n => {
    n.addEventListener('click', () => switchPage(n.dataset.page));
  });

  function renderToday() {
    const td = today();
    const d = new Date();
    document.getElementById('today-date').textContent = `${d.getMonth() + 1}月${d.getDate()}日 周${['日','一','二','三','四','五','六'][d.getDay()]}`;

    const reviews = getReviewsForDate(td);
    const totalMinutes = reviews.length * settings.minutesPerBook;
    const targetMinutes = settings.booksPerDay * settings.minutesPerBook;

    document.getElementById('hero-number').innerHTML = `${reviews.length} <small>本</small>`;
    document.getElementById('hero-time').textContent = `${totalMinutes} 分钟`;
    document.getElementById('review-count').textContent = `今日 ${reviews.length} 本 · ${totalMinutes} 分钟`;

    const pct = Math.min(100, (totalMinutes / targetMinutes) * 100);
    document.getElementById('time-fill').style.width = `${pct}%`;
    document.getElementById('time-label').textContent = `${totalMinutes} / ${targetMinutes} 分钟`;

    const list = document.getElementById('today-list');
    const empty = document.getElementById('today-empty');
    if (reviews.length === 0) {
      list.innerHTML = '';
      list.appendChild(empty);
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    list.innerHTML = reviews.map((r, idx) => {
      const done = r.completed ? 'checked' : '';
      const doneCls = r.completed ? 'done' : '';
      return `
        <div class="task-card ${doneCls}" data-id="${r.book.id}" data-key="${r.reviewKey}">
          <div class="task-check ${done}" data-id="${r.book.id}" data-key="${r.reviewKey}">
            ${r.completed ? '✓' : ''}
          </div>
          <div class="task-info">
            <div class="task-title">${r.title}</div>
            <div class="task-meta">${r.phase} · 建议 ${settings.minutesPerBook} 分钟</div>
          </div>
          <div class="task-phase">#${idx + 1}</div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.task-check').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const key = btn.dataset.key;
        const book = books.find(b => b.id === id);
        if (!book) return;
        if (!book.completedReviews) book.completedReviews = [];
        if (book.completedReviews.includes(key)) {
          book.completedReviews = book.completedReviews.filter(k => k !== key);
        } else {
          book.completedReviews.push(key);
        }
        saveBooks(books);
        renderToday();
      });
    });
  }

  function renderBooks() {
    const list = document.getElementById('book-list');
    const empty = document.getElementById('books-empty');
    if (books.length === 0) {
      list.innerHTML = '';
      list.appendChild(empty);
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    list.innerHTML = books.map(b => {
      const progress = getBookProgress(b);
      const next = getNextReview(b);
      const nextText = next ? `下次：${next.date}（${phaseLabel(next.interval)}）` : '全部完成！';
      return `
        <div class="book-card" data-id="${b.id}">
          <div class="book-icon">📖</div>
          <div class="book-info">
            <div class="book-title">${b.title}</div>
            <div class="book-meta">开始：${b.startDate}${b.note ? ' · ' + b.note : ''}</div>
            <div class="book-progress">${nextText} · ${progress.done}/${progress.total} 次</div>
          </div>
          <div class="book-actions">
            <button class="book-btn" data-action="delete" data-id="${b.id}">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (confirm('确定删除这本书？')) {
          books = books.filter(b => b.id !== id);
          saveBooks(books);
          renderBooks();
        }
      });
    });
  }

  const modal = document.getElementById('modal-add');
  const inputTitle = document.getElementById('input-title');
  const inputDate = document.getElementById('input-date');
  const inputNote = document.getElementById('input-note');

  document.getElementById('btn-add-book').addEventListener('click', () => {
    inputTitle.value = '';
    inputNote.value = '';
    inputDate.value = today();
    modal.classList.add('active');
  });
  document.querySelector('#modal-add .modal-overlay').addEventListener('click', () => modal.classList.remove('active'));
  document.getElementById('btn-cancel').addEventListener('click', () => modal.classList.remove('active'));

  document.getElementById('btn-save').addEventListener('click', () => {
    const title = inputTitle.value.trim();
    const preferred = inputDate.value;
    const note = inputNote.value.trim();
    if (!title || !preferred) { alert('请填写书名和日期'); return; }

    const startDate = findBestStartDate(preferred, null);
    const reviewOffsets = computeReviewOffsets(startDate, null);

    books.push({ id: genId(), title, startDate, note, reviewOffsets, completedReviews: [] });
    saveBooks(books);
    modal.classList.remove('active');

    if (startDate !== preferred) {
      alert(`已智能调度！\n期望日期：${preferred}\n实际开始：${startDate}\n确保每天 ${settings.booksPerDay} 本书的交错学习。`);
    }

    if (document.getElementById('page-books').classList.contains('active')) renderBooks();
    else switchPage('books');
  });

  const modalBatch = document.getElementById('modal-batch');
  const batchStartDate = document.getElementById('batch-start-date');
  const batchTitles = document.getElementById('batch-titles');
  const batchPreview = document.getElementById('batch-preview');

  function computeBatchSchedule(titles, startDate) {
    const result = [];
    let current = startDate;
    const savedBooks = JSON.parse(JSON.stringify(books));

    for (const title of titles) {
      const t = title.trim();
      if (!t) continue;
      const start = findBestStartDate(current, null);
      const offsets = computeReviewOffsets(start, null);
      books.push({ id: genId(), title: t, startDate: start, reviewOffsets: offsets, completedReviews: [] });
      result.push({ title: t, date: start });
      current = addDays(start, 1);
    }
    books = savedBooks;
    return result;
  }

  function updateBatchPreview() {
    const titles = batchTitles.value.split('\n');
    const start = batchStartDate.value;
    if (!start || !titles.some(t => t.trim())) {
      batchPreview.classList.remove('visible');
      return;
    }
    const schedule = computeBatchSchedule(titles, start);
    batchPreview.classList.add('visible');
    batchPreview.innerHTML = schedule.map((s, i) => `
      <div class="preview-item"><span>${i + 1}. ${s.title}</span><span class="preview-date">${s.date}</span></div>
    `).join('') + `<div class="preview-note">共 ${schedule.length} 本，最后一本开始于 ${schedule[schedule.length - 1].date}</div>`;
  }

  document.getElementById('btn-batch').addEventListener('click', () => {
    batchStartDate.value = today();
    batchTitles.value = '';
    batchPreview.classList.remove('visible');
    modalBatch.classList.add('active');
  });
  modalBatch.querySelector('.modal-overlay').addEventListener('click', () => modalBatch.classList.remove('active'));
  document.getElementById('btn-cancel-batch').addEventListener('click', () => modalBatch.classList.remove('active'));
  batchTitles.addEventListener('input', updateBatchPreview);
  batchStartDate.addEventListener('change', updateBatchPreview);

  document.getElementById('btn-save-batch').addEventListener('click', () => {
    const titles = batchTitles.value.split('\n').filter(t => t.trim());
    const start = batchStartDate.value;
    if (titles.length === 0 || !start) { alert('请填写起始日期和书籍列表'); return; }

    const schedule = computeBatchSchedule(titles, start);
    for (const s of schedule) {
      const startDate = findBestStartDate(s.date, null);
      const offsets = computeReviewOffsets(startDate, null);
      books.push({ id: genId(), title: s.title, startDate, reviewOffsets: offsets, completedReviews: [] });
    }
    saveBooks(books);
    modalBatch.classList.remove('active');
    alert(`已排满 ${schedule.length} 本书！\n第一本书：${schedule[0].date}\n最后一本书：${schedule[schedule.length - 1].date}`);
    switchPage('books');
  });

  let calCurrent = new Date();
  function renderCalendar() {
    const y = calCurrent.getFullYear();
    const m = calCurrent.getMonth();
    document.getElementById('cal-month').textContent = `${y}年${m + 1}月`;

    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const container = document.getElementById('cal-days');
    container.innerHTML = '';

    const td = today();
    const selected = document.querySelector('.cal-day.selected');
    const selectedDate = selected ? selected.dataset.date : td;

    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-day other-month';
      cell.textContent = new Date(y, m, 0).getDate() - firstDay + 1 + i;
      container.appendChild(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      const dateStr = fmtDate(new Date(y, m, d));
      const reviews = getReviewsForDate(dateStr);
      cell.className = 'cal-day';
      if (dateStr === td) cell.classList.add('today');
      if (reviews.length > 0) cell.classList.add('has-tasks');
      if (dateStr === selectedDate) cell.classList.add('selected');
      cell.dataset.date = dateStr;
      cell.innerHTML = `<span>${d}</span>`;
      if (reviews.length > 1) cell.innerHTML += `<span class="cal-badge">${reviews.length}</span>`;
      cell.addEventListener('click', () => {
        container.querySelectorAll('.cal-day').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
        showDayDetail(dateStr);
      });
      container.appendChild(cell);
    }

    const remaining = (7 - ((firstDay + daysInMonth) % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-day other-month';
      cell.textContent = i;
      container.appendChild(cell);
    }
    showDayDetail(selectedDate);
  }

  function showDayDetail(dateStr) {
    const reviews = getReviewsForDate(dateStr);
    const d = new Date(dateStr + 'T00:00:00');
    document.getElementById('detail-date').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${['日','一','二','三','四','五','六'][d.getDay()]}`;
    const list = document.getElementById('detail-list');
    if (reviews.length === 0) {
      list.innerHTML = '<p class="empty-hint">当天没有学习安排</p>';
      return;
    }
    const totalMin = reviews.length * settings.minutesPerBook;
    list.innerHTML = `<p style="font-size:0.8rem;color:var(--text-light);margin-bottom:8px;">共 ${reviews.length} 本 · ${totalMin} 分钟</p>` +
      reviews.map((r, i) => `
        <div class="detail-item"><span>${i + 1}. ${r.title}</span><span class="phase-tag">${r.phase}</span></div>
      `).join('');
  }

  document.getElementById('cal-prev').addEventListener('click', () => { calCurrent.setMonth(calCurrent.getMonth() - 1); renderCalendar(); });
  document.getElementById('cal-next').addEventListener('click', () => { calCurrent.setMonth(calCurrent.getMonth() + 1); renderCalendar(); });

  function renderSettings() {
    document.getElementById('setting-books-per-day').value = settings.booksPerDay;
    document.getElementById('setting-minutes-per-book').value = settings.minutesPerBook;
  }

  document.getElementById('setting-books-per-day').addEventListener('change', (e) => {
    settings.booksPerDay = Math.max(1, Math.min(5, parseInt(e.target.value) || 3));
    saveSettings(settings);
  });
  document.getElementById('setting-minutes-per-book').addEventListener('change', (e) => {
    settings.minutesPerBook = Math.max(10, Math.min(60, parseInt(e.target.value) || 30));
    saveSettings(settings);
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    const data = JSON.stringify({ books, settings, version: 2, exportDate: today() }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ebbinghaus_backup_${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const importModal = document.getElementById('modal-import');
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-area').value = '';
    importModal.classList.add('active');
  });
  importModal.querySelector('.modal-overlay').addEventListener('click', () => importModal.classList.remove('active'));
  document.getElementById('btn-cancel-import').addEventListener('click', () => importModal.classList.remove('active'));
  document.getElementById('btn-confirm-import').addEventListener('click', () => {
    try {
      const data = JSON.parse(document.getElementById('import-area').value.trim());
      if (data && Array.isArray(data.books)) {
        books = data.books;
        if (data.settings) settings = { ...DEFAULT_SETTINGS, ...data.settings };
        saveBooks(books);
        saveSettings(settings);
        importModal.classList.remove('active');
        alert('导入成功！');
        switchPage('today');
      } else { alert('数据格式不正确'); }
    } catch (e) { alert('解析失败，请检查JSON格式'); }
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('确定清空所有数据？此操作不可恢复！')) {
      books = [];
      saveBooks(books);
      alert('已清空');
      switchPage('today');
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  switchPage('today');
})();
