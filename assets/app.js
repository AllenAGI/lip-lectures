(function () {
  var DATA = (window.LIP_DATA || { lectures: [] }).lectures;
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var rxEsc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };
  var hl = function (text, q) {
    var t = esc(text);
    if (!q) return t;
    try { return t.replace(new RegExp(rxEsc(esc(q)), "gi"), function (m) { return "<mark>" + m + "</mark>"; }); }
    catch (e) { return t; }
  };

  function topics(t) {
    var out = [];
    if (/VLA|RT-2|OpenVLA|π0|pi0|πstar/i.test(t)) out.push("VLA");
    if (/世界模型|World\s*Model|WAM|World Action/i.test(t)) out.push("世界模型");
    if (/强化学习|PPO|RECAP|RL/i.test(t)) out.push("强化学习");
    if (/VLN|导航/i.test(t)) out.push("导航");
    if (/机器人|Franka|ALOHA|Spot|宇树|Atlas|MuJoCo|LIBERO|人形/i.test(t)) out.push("本体与仿真");
    if (/数据|DROID|OXE|AgiBot/i.test(t)) out.push("数据");
    if (/视频|Flow\s*Matching|AdaLN|生成/i.test(t)) out.push("生成模型");
    return out;
  }

  function mdToHtml(md) {
    var s = esc(md);
    s = s.replace(/```([\s\S]*?)```/g, function (m, c) { return "<pre><code>" + c.trim() + "</code></pre>"; });
    s = s.replace(/^###\s+(.*)$/gm, "<h3>$1</h3>").replace(/^##\s+(.*)$/gm, "<h2>$1</h2>").replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    s = s.replace(/^&gt;\s?(.*)$/gm, "<blockquote>$1</blockquote>");
    s = s.replace(/(?:^|\n)((?:[-*]\s+.*(?:\n|$))+)/g, function (m, block) {
      var items = block.trim().split(/\n/).map(function (l) { return "<li>" + l.replace(/^[-*]\s+/, "") + "</li>"; }).join("");
      return "<ul>" + items + "</ul>";
    });
    return s.split(/\n{2,}/).map(function (b) {
      var t = b.trim();
      if (!t) return "";
      if (/^<(h[1-3]|ul|pre|blockquote|table)/.test(t)) return t;
      return "<p>" + t.replace(/\n/g, "<br>") + "</p>";
    }).join("\n");
  }

  /* ---------------- index ---------------- */
  if (document.getElementById("grid")) {
    var grid = document.getElementById("grid");
    var chips = document.getElementById("chips");
    var results = document.getElementById("results");
    var q = document.getElementById("q");
    var meta = document.getElementById("meta");
    var sub = document.getElementById("sub");
    var totalSlides = DATA.reduce(function (a, l) { return a + l.slides.length; }, 0);
    var totalNotes = DATA.reduce(function (a, l) { return a + l.notes.length; }, 0);
    meta.textContent = DATA.length + " 期 · " + totalSlides + " 页 · " + totalNotes + " 篇笔记";
    sub.textContent = DATA.length + " 期讲座、" + totalSlides + " 页幻灯片、" + totalNotes + " 篇调研笔记。全部在页面里直接翻，不跳转 GitHub。";

    var filter = "全部";
    var topicCount = {};
    DATA.forEach(function (l) { topics(l.title).forEach(function (t) { topicCount[t] = (topicCount[t] || 0) + 1; }); });
    var topicList = ["全部"].concat(Object.keys(topicCount).sort(function (a, b) { return topicCount[b] - topicCount[a]; }));
    chips.innerHTML = topicList.map(function (t) {
      return '<button class="chip' + (t === filter ? " on" : "") + '" data-t="' + esc(t) + '">' + esc(t) + "</button>";
    }).join("");
    chips.addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      filter = b.getAttribute("data-t");
      [].forEach.call(chips.children, function (c) { c.classList.toggle("on", c === b); });
      render();
    });

    function card(l) {
      var tp = topics(l.title).slice(0, 3);
      return '<a class="card" href="lecture.html?id=' + encodeURIComponent(l.id) + '">' +
        '<div class="row"><span class="no">' + esc(l.id) + "</span>" +
        (l.ep ? '<span class="ep">' + esc(l.ep) + "</span>" : "") + "</div>" +
        "<h3>" + esc(l.title) + "</h3>" +
        (tp.length ? '<div class="tags">' + tp.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>" : "") +
        '<div class="stats"><span><b>' + l.slides.length + "</b> 页幻灯片</span><span><b>" + l.notes.length + "</b> 篇笔记</span></div>" +
        "</a>";
    }

    function render() {
      var list = DATA.filter(function (l) { return filter === "全部" || topics(l.title).indexOf(filter) >= 0; });
      grid.innerHTML = list.map(card).join("");
      results.hidden = true;
      grid.hidden = false;
    }
    render();
    var preset = new URLSearchParams(location.search).get("q");
    if (preset) { q.value = preset; run(); }

    /* search */
    var index = null;
    function buildIndex() {
      if (index) return index;
      index = [];
      DATA.forEach(function (l) {
        l.slides.forEach(function (s) { index.push({ kind: "slide", l: l, n: s.n, t: s.t, x: s.x }); });
        l.notes.forEach(function (nt) { index.push({ kind: "note", l: l, n: nt.name, t: nt.name, x: nt.text }); });
      });
      return index;
    }
    function snippet(text, query) {
      var i = text.toLowerCase().indexOf(query.toLowerCase());
      if (i < 0) return text.slice(0, 90);
      var a = Math.max(0, i - 40), b = Math.min(text.length, i + query.length + 70);
      return (a > 0 ? "…" : "") + text.slice(a, b) + (b < text.length ? "…" : "");
    }
    var timer = null;
    q.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 140); });
    q.addEventListener("keydown", function (e) { if (e.key === "Escape") { q.value = ""; run(); } });

    function run() {
      var query = q.value.trim();
      if (!query) { render(); return; }
      var idx = buildIndex();
      var ql = query.toLowerCase();
      var hits = idx.filter(function (r) {
        return (r.t && r.t.toLowerCase().indexOf(ql) >= 0) || (r.x && r.x.toLowerCase().indexOf(ql) >= 0);
      });
      grid.hidden = true;
      results.hidden = false;
      if (!hits.length) {
        results.innerHTML = '<h2>没有找到「' + esc(query) + '」</h2><div class="empty">试试更短的词，比如「π0」「世界模型」「仿真」。</div>';
        return;
      }
      var slides = hits.filter(function (h) { return h.kind === "slide"; });
      var notes = hits.filter(function (h) { return h.kind === "note"; });
      var html = "";
      if (slides.length) {
        html += "<h2>幻灯片 · " + slides.length + " 条</h2>";
        html += slides.slice(0, 120).map(function (h) {
          return '<div class="res" data-id="' + esc(h.l.id) + '" data-s="' + h.n + '">' +
            '<div class="where">' + esc(h.l.id) + " · " + esc(h.l.title) + "<br><b>第 " + h.n + " 页</b></div>" +
            '<div class="what"><span class="t">' + hl(h.t, query) + "</span>　" + hl(snippet(h.x, query), query) + "</div></div>";
        }).join("");
      }
      if (notes.length) {
        html += "<h2>笔记 · " + notes.length + " 篇</h2>";
        html += notes.slice(0, 60).map(function (h) {
          return '<div class="res" data-id="' + esc(h.l.id) + '" data-note="' + esc(h.n) + '">' +
            '<div class="where">' + esc(h.l.id) + " · " + esc(h.l.title) + "<br><b>笔记</b></div>" +
            '<div class="what"><span class="t">' + hl(h.t, query) + "</span>　" + hl(snippet(h.x, query), query) + "</div></div>";
        }).join("");
      }
      results.innerHTML = html;
    }
    results.addEventListener("click", function (e) {
      var r = e.target.closest(".res");
      if (!r) return;
      var id = r.getAttribute("data-id");
      if (r.hasAttribute("data-s")) location.href = "lecture.html?id=" + encodeURIComponent(id) + "&s=" + r.getAttribute("data-s");
      else location.href = "lecture.html?id=" + encodeURIComponent(id);
    });
  }

  /* ---------------- lecture ---------------- */
  if (document.getElementById("deck")) {
    var params = new URLSearchParams(location.search);
    var id = params.get("id") || (DATA[0] && DATA[0].id);
    var start = parseInt(params.get("s") || "1", 10);
    var idx2 = DATA.findIndex(function (l) { return l.id === id; });
    if (idx2 < 0) idx2 = 0;
    var L = DATA[idx2];
    var frame = document.getElementById("deck");
    var cnt = document.getElementById("cnt");
    var olPanel = document.getElementById("panel-ol");
    var notesPanel = document.getElementById("panel-notes");
    var aboutPanel = document.getElementById("panel-about");
    var ttl = document.getElementById("ttl");

    document.title = L.id + " · " + L.title;
    ttl.innerHTML = "<b>" + esc(L.id) + "</b>　" + esc(L.title) + (L.ep ? '<span>' + esc(L.ep) + "</span>" : "");
    frame.src = "decks/" + encodeURIComponent(L.id) + ".html#" + (start || 1);

    olPanel.innerHTML = '<ul class="ol">' + L.slides.map(function (s) {
      return '<li data-n="' + s.n + '"><span class="n">' + s.n + "</span><span>" + esc(s.t) + "</span></li>";
    }).join("") + "</ul>";

    if (L.notes.length) {
      notesPanel.innerHTML = L.notes.map(function (nt, i) {
        return '<div class="noteitem" data-i="' + i + '"><button>' + esc(nt.name) + '</button><div class="body">' + mdToHtml(nt.text) + "</div></div>";
      }).join("");
      notesPanel.addEventListener("click", function (e) {
        var b = e.target.closest(".noteitem > button");
        if (!b) return;
        b.parentNode.classList.toggle("open");
      });
    } else {
      notesPanel.innerHTML = '<div class="about">这一期还没有抓到笔记文件。</div>';
    }

    aboutPanel.innerHTML = '<div class="about"><dl>' +
      "<dt>期号</dt><dd>" + esc(L.ep || "—") + "</dd>" +
      "<dt>标题</dt><dd>" + esc(L.title) + "</dd>" +
      "<dt>幻灯片</dt><dd>" + L.slides.length + " 页</dd>" +
      "<dt>笔记</dt><dd>" + L.notes.length + " 篇</dd>" +
      "<dt>原始目录</dt><dd>" + esc(L.dir) + "</dd>" +
      "<dt>说明</dt><dd>幻灯片按原始 HTML deck 渲染，图片经镜像按需加载（受网络限速，可能较慢）。笔记为本期调研材料原文。</dd>" +
      "</dl>" +
      (L.readme ? '<div style="margin-top:16px;padding-top:14px;border-top:1px solid #2b2c30">' + mdToHtml(L.readme) + "</div>" : "") +
      "</div>";

    document.querySelectorAll(".tabs button").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
        var t = b.getAttribute("data-tab");
        olPanel.hidden = t !== "ol";
        notesPanel.hidden = t !== "notes";
        aboutPanel.hidden = t !== "about";
      });
    });

    function highlight(n) {
      olPanel.querySelectorAll("li").forEach(function (li) { li.classList.toggle("on", +li.getAttribute("data-n") === n); });
      var act = olPanel.querySelector("li.on");
      if (act && act.scrollIntoView) act.scrollIntoView({ block: "nearest" });
      cnt.textContent = n + " / " + L.slides.length;
      try { history.replaceState(null, "", "?id=" + encodeURIComponent(L.id) + "&s=" + n); } catch (e) {}
    }

    function activeIndex() {
      try {
        var doc = frame.contentDocument;
        if (!doc) return 0;
        var all = doc.querySelectorAll(".slide");
        for (var i = 0; i < all.length; i++) if (all[i].classList.contains("active")) return i + 1;
      } catch (e) {}
      return 0;
    }

    function send(key) {
      try {
        var doc = frame.contentDocument;
        var ev = new KeyboardEvent("keydown", { key: key, bubbles: true, cancelable: true });
        doc.dispatchEvent(ev);
        doc.documentElement.dispatchEvent(ev);
      } catch (e) {}
    }

    olPanel.addEventListener("click", function (e) {
      var li = e.target.closest("li");
      if (!li) return;
      var n = +li.getAttribute("data-n");
      frame.src = "decks/" + encodeURIComponent(L.id) + ".html#" + n;
      highlight(n);
    });

    document.getElementById("next").onclick = function () { send("ArrowRight"); };
    document.getElementById("prev").onclick = function () { send("ArrowLeft"); };
    document.getElementById("nextL").onclick = function () { if (idx2 < DATA.length - 1) location.href = "lecture.html?id=" + encodeURIComponent(DATA[idx2 + 1].id); };
    document.getElementById("prevL").onclick = function () { if (idx2 > 0) location.href = "lecture.html?id=" + encodeURIComponent(DATA[idx2 - 1].id); };

    window.addEventListener("keydown", function (e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); send("ArrowRight"); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); send("ArrowLeft"); }
    });

    var last = -1;
    setInterval(function () {
      var n = activeIndex();
      if (n && n !== last) { last = n; highlight(n); }
    }, 400);

    highlight(Math.min(Math.max(start || 1, 1), L.slides.length));
  }
})();
