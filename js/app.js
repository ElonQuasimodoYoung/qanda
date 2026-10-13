(function () {
  const BANDS = {
    high: { label: "高频", note: "至少 6 份材料提到，优先和伴侣对过" },
    mid: { label: "中频", note: "3 到 5 份材料提到" },
    low: { label: "低频", note: "1 到 2 份材料提到，仍可能被问到" },
  };
  const TOPIC_ORDER = ["开场确认", "认识与时间线", "同住与日常", "联系与相处", "财务", "对方与家庭", "婚姻", "未来", "其他"];
  const STORAGE_KEY = "visa-prep-draft-v1";

  const questions = (window.QUESTIONS || []).map(function (q) {
    return Object.assign({}, q, {
      band: q.count >= 6 ? "high" : q.count >= 3 ? "mid" : "low",
    });
  });

  const list = document.getElementById("list");
  let filter = "all";
  let query = "";

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (!data || typeof data !== "object") return { answers: {}, profile: { who: "", partner: "" } };
      return {
        answers: data.answers && typeof data.answers === "object" ? data.answers : {},
        profile: {
          who: data.profile && data.profile.who ? String(data.profile.who) : "",
          partner: data.profile && data.profile.partner ? String(data.profile.partner) : "",
        },
      };
    } catch (err) {
      return { answers: {}, profile: { who: "", partner: "" } };
    }
  }

  function answers() {
    return loadDraft().answers;
  }

  function profile() {
    return loadDraft().profile;
  }

  function persist(next) {
    const current = loadDraft();
    const draft = {
      answers: next.answers || current.answers,
      profile: next.profile || current.profile,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    document.getElementById("dock-status").textContent = "已保存在这台浏览器";
  }

  function grouped(items) {
    return ["high", "mid", "low"].map(function (band) {
      const inBand = items.filter(function (q) { return q.band === band; });
      const topics = [];
      TOPIC_ORDER.forEach(function (topic) {
        const found = inBand.filter(function (q) { return q.topic === topic; });
        if (found.length) topics.push({ topic: topic, items: found });
      });
      return { band: band, topics: topics, total: inBand.length };
    }).filter(function (group) { return group.total; });
  }

  function visibleQuestions() {
    const q = query.trim().toLowerCase();
    const store = answers();
    return questions.filter(function (item) {
      if (filter === "blank" && String(store[item.id] || "").trim()) return false;
      if (filter !== "all" && filter !== "blank" && item.band !== filter) return false;
      if (!q) return true;
      return (item.text + " " + (item.en || "") + " " + item.topic).toLowerCase().indexOf(q) !== -1;
    });
  }

  function render() {
    const store = answers();
    const groups = grouped(visibleQuestions());
    list.innerHTML = groups.map(function (group) {
      const meta = BANDS[group.band];
      const topics = group.topics.map(function (block) {
        const cards = block.items.map(function (item) {
          const value = store[item.id] || "";
          return (
            '<article class="card ' + item.band + '">' +
              '<div class="q-top"><h3 class="q-title">' + escapeHtml(item.text) + '</h3>' +
              '<span class="badge">出现 ' + item.count + ' 次</span></div>' +
              (item.en ? '<p class="en">' + escapeHtml(item.en) + '</p>' : '') +
              '<p class="hint">' + escapeHtml(item.hint || "") + '</p>' +
              '<label for="a-' + item.id + '">你的答案</label>' +
              '<textarea id="a-' + item.id + '" data-answer="' + item.id + '" placeholder="用自己的话写。日期、地址和金额尽量与申请材料一致。">' + escapeHtml(value) + '</textarea>' +
              '<p class="saved">' + (String(value).trim() ? "已保存" : "") + '</p>' +
            '</article>'
          );
        }).join("");
        return '<h3 class="topic">' + escapeHtml(block.topic) + '</h3>' + cards;
      }).join("");
      return '<section class="band"><div class="band-head"><h2>' + meta.label + '</h2><p>' + group.total + ' 题 · ' + meta.note + '</p></div>' + topics + '</section>';
    }).join("");
    document.getElementById("empty").hidden = groups.length !== 0;
    const counts = { high: 0, mid: 0, low: 0 };
    questions.forEach(function (item) { counts[item.band] += 1; });
    document.getElementById("count-high").textContent = counts.high;
    document.getElementById("count-mid").textContent = counts.mid;
    document.getElementById("count-low").textContent = counts.low;
    updateProgress();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateProgress() {
    const store = answers();
    const filled = questions.filter(function (item) { return String(store[item.id] || "").trim(); }).length;
    document.getElementById("done-count").textContent = filled + " / " + questions.length;
    document.getElementById("done-bar").style.width = (questions.length ? (filled / questions.length) * 100 : 0) + "%";
  }

  function saveAnswer(id, value) {
    const store = answers();
    store[id] = value;
    persist({ answers: store });
    const card = list.querySelector('[data-answer="' + id + '"]');
    const slot = card && card.parentElement.querySelector(".saved");
    if (slot) slot.textContent = value.trim() ? "已保存" : "";
    updateProgress();
  }

  function saveProfile() {
    persist({
      profile: {
        who: document.getElementById("who").value.trim(),
        partner: document.getElementById("partner").value.trim(),
      },
    });
  }

  function buildPrint() {
    const store = answers();
    const info = profile();
    const filled = questions.filter(function (item) { return String(store[item.id] || "").trim(); }).length;
    const when = new Date();
    const stamp = when.getFullYear() + "-" + String(when.getMonth() + 1).padStart(2, "0") + "-" + String(when.getDate()).padStart(2, "0");
    const head = grouped(questions).map(function (group) {
      const blocks = group.topics.map(function (block) {
        return block.items.map(function (item) {
          const answer = String(store[item.id] || "").trim();
          return (
            '<section class="print-q"><strong>' + escapeHtml(item.text) + '</strong>' +
            '<div class="meta">' + BANDS[item.band].label + ' · 出现 ' + item.count + ' 次 · ' + escapeHtml(item.topic) +
            (item.en ? ' · ' + escapeHtml(item.en) : '') + '</div>' +
            '<p>' + escapeHtml(answer || "（未填写）") + '</p></section>'
          );
        }).join("");
      }).join("");
      return '<h2 class="print-band">' + BANDS[group.band].label + '</h2>' + blocks;
    }).join("");
    document.getElementById("print-sheet").innerHTML =
      '<h1>澳洲配偶签 / 189 副申请 · 电话调查备忘</h1>' +
      '<p class="print-meta">填写人：' + escapeHtml(info.who || "未填写") +
      '　伴侣：' + escapeHtml(info.partner || "未填写") +
      '<br>导出日期：' + stamp +
      '　已填写 ' + filled + ' / ' + questions.length +
      '　频率按 13 份材料统计</p>' + head;
  }

  function exportPdf() {
    buildPrint();
    document.getElementById("dock-status").textContent = "在打印窗口中选择「存储为 PDF」";
    const previous = document.title;
    const info = profile();
    document.title = "电话调查备忘-" + (info.who || "未署名");
    window.print();
    document.title = previous;
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(loadDraft(), null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    const info = profile();
    link.href = URL.createObjectURL(blob);
    link.download = "电话调查备忘-" + (info.who || "备份") + ".json";
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1500);
    document.getElementById("dock-status").textContent = "备份文件已下载";
  }

  function restoreBackup(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(String(reader.result || ""));
        if (!data || typeof data.answers !== "object") throw new Error("bad file");
        persist({
          answers: data.answers,
          profile: {
            who: data.profile && data.profile.who ? String(data.profile.who).slice(0, 40) : "",
            partner: data.profile && data.profile.partner ? String(data.profile.partner).slice(0, 40) : "",
          },
        });
        const saved = profile();
        document.getElementById("who").value = saved.who;
        document.getElementById("partner").value = saved.partner;
        render();
        document.getElementById("dock-status").textContent = "已从备份恢复";
      } catch (err) {
        document.getElementById("dock-status").textContent = "这个文件不是备忘备份";
      }
    };
    reader.readAsText(file);
  }

  document.getElementById("filters").addEventListener("click", function (event) {
    const button = event.target.closest("button");
    if (!button) return;
    filter = button.dataset.filter;
    Array.from(document.getElementById("filters").children).forEach(function (chip) {
      chip.setAttribute("aria-pressed", chip === button ? "true" : "false");
    });
    render();
  });
  document.getElementById("search").addEventListener("input", function (event) {
    query = event.target.value;
    render();
  });
  list.addEventListener("input", function (event) {
    const box = event.target;
    if (!box.dataset.answer) return;
    saveAnswer(box.dataset.answer, box.value);
  });
  list.addEventListener("focusout", function (event) {
    if (filter === "blank" && event.target.dataset && event.target.dataset.answer) render();
  });
  document.getElementById("who").addEventListener("input", saveProfile);
  document.getElementById("partner").addEventListener("input", saveProfile);
  document.getElementById("export").addEventListener("click", exportPdf);
  document.getElementById("backup").addEventListener("click", downloadBackup);
  document.getElementById("restore").addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (file) restoreBackup(file);
    event.target.value = "";
  });
  window.addEventListener("beforeprint", buildPrint);
  document.getElementById("clear").addEventListener("click", function () {
    if (!confirm("清空这台浏览器里保存的全部答案？")) return;
    localStorage.removeItem(STORAGE_KEY);
    document.getElementById("who").value = "";
    document.getElementById("partner").value = "";
    render();
    document.getElementById("dock-status").textContent = "已清空";
  });

  const saved = profile();
  document.getElementById("who").value = saved.who;
  document.getElementById("partner").value = saved.partner;
  render();
  if (localStorage.getItem(STORAGE_KEY)) {
    document.getElementById("dock-status").textContent = "已恢复上次填写的内容";
  }
})();
