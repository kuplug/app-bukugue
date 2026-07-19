/**
 * quiz.js — "Obrolan Singkat" interactive funnel.
 *
 * Arsitektur diadaptasi dari prototipe Gemini (Bimaristan/Shaidul Khatir):
 *  - Dataset deklaratif per-langkah (lihat config.json -> quiz.steps)
 *  - ViewRenderers: satu fungsi render per "type" langkah
 *  - QuizController: state machine kecil (render -> bindEvents -> transitionToNext)
 * Bedanya dengan prototipe asal: langkah "recommendation" tidak memakai data
 * statis, tapi memanggil /api/ebooks yang sama dengan yang dipakai index.html,
 * lalu mencocokkan berdasarkan tag yang terkumpul dari jawaban pengguna.
 */

const QuizState = {
  stepKey: "start",
  history: [],       // stack of previous step keys, untuk tombol "kembali"
  collectedTags: [],
  answerLabels: [],  // teks jawaban yang dipilih, dipakai di layar diagnosis
};

function quizAddAnswer(text, tags) {
  QuizState.answerLabels.push(text);
  (tags || []).forEach((t) => {
    const tag = String(t).toLowerCase();
    if (!QuizState.collectedTags.includes(tag)) QuizState.collectedTags.push(tag);
  });
}

const QuizViews = {
  header(cfg) {
    const q = cfg.quiz;
    return `
      <div class="quiz-header">
        <div class="brand">
          <div class="badge">${escapeHtml(q.brand_badge || "B")}</div>
          <div>
            <h4>${escapeHtml(cfg.site.name)}</h4>
            <p>Obrolan Singkat</p>
          </div>
        </div>
        <a class="close-link" href="index.html" title="Tutup">✕</a>
      </div>
    `;
  },

  footerButton(label) {
    return `
      <div class="quiz-footer">
        <button class="quiz-btn-primary" id="quiz-next-btn" disabled>${escapeHtml(label)}</button>
      </div>
    `;
  },

  backLink() {
    return QuizState.history.length
      ? `<a class="quiz-back" id="quiz-back-btn">← Kembali</a>`
      : "";
  },

  "list-selection"(step, cfg) {
    const items = step.options
      .map(
        (opt) => `
        <button type="button" class="quiz-option-btn" data-answer='${escapeHtml(opt.text)}' data-tags='${escapeHtml(JSON.stringify(opt.tags || []))}'>
          <span>${escapeHtml(opt.text)}</span>
          <span class="arrow">→</span>
        </button>`
      )
      .join("");
    return `
      ${this.header(cfg)}
      <div class="quiz-step-title">${escapeHtml(step.title)}</div>
      <p class="quiz-step-desc">${escapeHtml(step.description || "")}</p>
      <div class="quiz-options">${items}</div>
    `;
  },

  "radio-selection"(step, cfg) {
    const items = step.options
      .map(
        (opt, idx) => `
        <label class="quiz-radio-item">
          <span><span class="icon">${opt.icon || "•"}</span>${escapeHtml(opt.text)}</span>
          <input type="radio" name="quiz-radio" value="${idx}" />
        </label>`
      )
      .join("");
    return `
      ${this.backLink()}
      <div class="quiz-step-title" style="text-align:center;">${escapeHtml(step.title)}</div>
      <div class="quiz-radio-list" id="quiz-radio-list" data-options='${escapeHtml(JSON.stringify(step.options))}'>${items}</div>
      ${this.footerButton("Lanjut →")}
    `;
  },

  "diagnosis"(step) {
    const items = QuizState.answerLabels
      .slice(-2)
      .map((label) => `<li>${escapeHtml(label)}</li>`)
      .join("");
    return `
      ${this.backLink()}
      <div class="quiz-quote-wrap" style="flex:none;">
        <div class="quiz-diagnosis-icon">🤍</div>
        <h3 class="quiz-step-title" style="text-align:center;">${escapeHtml(step.title)}</h3>
        <p class="quiz-step-desc" style="text-align:center;">${escapeHtml(step.subtitle || "")}</p>
      </div>
      <div class="quiz-diagnosis-box">
        <p class="label">${escapeHtml(step.summary_title || "")}</p>
        <ul>${items}</ul>
      </div>
      <p class="quiz-footnote">${escapeHtml(step.footer_note || "")}</p>
      ${this.footerButtonEnabled("Cari bacaannya →")}
    `;
  },

  footerButtonEnabled(label) {
    return `
      <div class="quiz-footer">
        <button class="quiz-btn-primary" id="quiz-next-btn">${escapeHtml(label)}</button>
      </div>
    `;
  },

  "recommendation"(step, cfg, matchedEbooks) {
    let body;
    if (!matchedEbooks.length) {
      body = `<p class="quiz-step-desc">${escapeHtml(step.empty_text || "")}</p>`;
    } else {
      body = matchedEbooks
        .map((eb) => {
          const minutes = readingTimeMinutes(eb);
          return `
          <a class="quiz-rec-card" href="ebook.html?slug=${encodeURIComponent(eb.slug)}">
            <span class="rc-left">
              <img class="rc-cover" src="${escapeHtml(eb.cover_url || "")}" alt="" />
              <span>
                <h4>${escapeHtml(eb.title)}</h4>
                <p>${escapeHtml(eb.author || "")}</p>
              </span>
            </span>
            <span class="rc-time">±${minutes}m</span>
          </a>`;
        })
        .join("");
    }
    return `
      ${this.backLink()}
      <div class="quiz-step-title">${escapeHtml(step.title)}</div>
      <p class="quiz-step-desc">${escapeHtml(step.subtitle || "")}</p>
      <div>${body}</div>
      ${this.footerButtonEnabled("Lanjut →")}
    `;
  },

  "muhasabah"(step) {
    const opts = step.options
      .map((o) => `<button type="button" class="quiz-muhasabah-btn" data-answer="${escapeHtml(o)}">${escapeHtml(o)}</button>`)
      .join("");
    return `
      <div class="quiz-quote-wrap">
        <div class="quiz-quote-mark">“</div>
        <p class="quiz-quote-eyebrow">${escapeHtml(step.title)}</p>
        <p class="quiz-quote-text">${escapeHtml(step.quote)}</p>
      </div>
      <div class="quiz-muhasabah-options">${opts}</div>
      <p class="quiz-footnote" style="margin-top:.9rem;">${escapeHtml(step.footer_note || "")}</p>
    `;
  },

  "action-plan"(step) {
    const tasks = step.tasks
      .map((t) => `<div class="quiz-task"><span>${t.icon || "•"}</span><span>${escapeHtml(t.text)}</span></div>`)
      .join("");
    return `
      <div class="quiz-action-title"><span>🌿</span><h3>${escapeHtml(step.title)}</h3></div>
      <div>${tasks}</div>
      <div class="quiz-quote-card">
        <p class="q">"${escapeHtml(step.quote)}"</p>
        <p class="a">— ${escapeHtml(step.author || "")}</p>
      </div>
      <div class="quiz-closing-links">
        <a class="ghost" href="index.html">Kembali ke beranda</a>
        <a class="primary" href="index.html#results-section">Lihat semua bacaan</a>
      </div>
    `;
  },
};

class QuizController {
  constructor(cfg, containerId) {
    this.cfg = cfg;
    this.steps = cfg.quiz.steps;
    this.container = document.getElementById(containerId);
    this.allEbooks = [];
    this.render();
    this.container.addEventListener("click", (e) => this.onClick(e));
  }

  async render() {
    const step = this.steps[QuizState.stepKey];
    if (!step) return;

    if (step.type === "recommendation") {
      if (!this.allEbooks.length) {
        try {
          const data = await apiGet("/api/ebooks");
          this.allEbooks = data.ebooks || [];
        } catch (e) {
          this.allEbooks = [];
        }
      }
      const matched = this.rankByTags(this.allEbooks, QuizState.collectedTags).slice(0, 3);
      this.container.innerHTML = QuizViews[step.type].call(QuizViews, step, this.cfg, matched);
    } else {
      this.container.innerHTML = QuizViews[step.type].call(QuizViews, step, this.cfg);
    }

    const nextBtn = document.getElementById("quiz-next-btn");
    if (nextBtn && step.type === "radio-selection") {
      nextBtn.disabled = true;
    }
  }

  rankByTags(ebooks, tags) {
    if (!tags.length) return ebooks.slice(0, 3);
    const scored = ebooks
      .map((eb) => {
        const ebTags = parseTags(eb);
        const score = ebTags.filter((t) => tags.includes(t)).length;
        return { eb, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length) return scored.map((x) => x.eb);
    return ebooks.slice(0, 3); // fallback: tetap tampilkan sesuatu, bukan kosong
  }

  onClick(e) {
    const step = this.steps[QuizState.stepKey];

    // list-selection: klik langsung lanjut
    const optBtn = e.target.closest(".quiz-option-btn");
    if (optBtn) {
      const tags = JSON.parse(optBtn.dataset.tags || "[]");
      quizAddAnswer(optBtn.dataset.answer, tags);
      this.goTo(step.next);
      return;
    }

    // radio-selection: klik label memilih radio, tombol Lanjut baru trigger next
    const radioItem = e.target.closest(".quiz-radio-item");
    if (radioItem && step.type === "radio-selection") {
      const input = radioItem.querySelector("input[type=radio]");
      if (input) input.checked = true;
      const nextBtn = document.getElementById("quiz-next-btn");
      if (nextBtn) nextBtn.disabled = false;
      return;
    }

    // muhasabah: klik pilihan apapun langsung lanjut
    const muhasabahBtn = e.target.closest(".quiz-muhasabah-btn");
    if (muhasabahBtn && step.type === "muhasabah") {
      this.goTo(step.next);
      return;
    }

    // tombol back
    if (e.target.id === "quiz-back-btn") {
      const prev = QuizState.history.pop();
      if (prev) {
        QuizState.stepKey = prev;
        this.render();
      }
      return;
    }

    // tombol lanjut (radio-selection / diagnosis / recommendation)
    if (e.target.id === "quiz-next-btn") {
      if (step.type === "radio-selection") {
        const list = document.getElementById("quiz-radio-list");
        const options = JSON.parse(list.dataset.options || "[]");
        const checked = list.querySelector("input[type=radio]:checked");
        if (!checked) return;
        const opt = options[Number(checked.value)];
        quizAddAnswer(opt.text, opt.tags);
      }
      this.goTo(step.next);
    }
  }

  goTo(nextKey) {
    if (!nextKey) return;
    QuizState.history.push(QuizState.stepKey);
    QuizState.stepKey = nextKey;
    this.render();
  }
}
