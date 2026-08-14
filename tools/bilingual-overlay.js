(() => {
  const exact = new Map([
    ["内部工具 · 尺寸仅在本机计算", "Offline tool · dimensions stay on this device"],
    ["包装刀模生成器", "Packaging Dieline Generator"],
    ["离线可计算", "Offline"],
    ["运行状态", "Runtime status"],
    ["刀模参数", "Dieline parameters"],
    ["选择箱型", "Select box type"],
    ["当前开放 0201、0202A、E005C 与 C001GX 四款结构", "Four box styles available: 0201, 0202A, E005C, C001GX"],
    ["箱型", "Box type"],
    ["0201 · 标准纸箱", "0201 · Standard carton"],
    ["0202A · 普通开槽纸箱", "0202A · Regular slotted carton"],
    ["E005C · 翻盖飞机盒（0427）", "E005C · Flip-top mailer (0427)"],
    ["C001GX · 锁底自扣盒", "C001GX · Lock-bottom carton"],
    ["输入刀模尺寸", "Enter dieline dimensions"],
    ["单位：毫米 mm", "Unit: mm"],
    ["瓦楞楞型", "Flute"],
    ["自定义纸厚…", "Custom caliper…"],
    ["自定义纸厚（1.5–5.0 mm）", "Custom caliper (1.5–5.0 mm)"],
    ["C001GX 插舌样式", "C001GX tongue style"],
    ["插卡式", "Card-lock style"],
    ["插入式", "Insert style"],
    ["开口方向", "Opening face"],
    ["开口面 = 摇盖所在面，点击切换数据位置", "Opening face = flap side; click to switch dimensions"],
    ["大面", "Large face"],
    ["中面", "Medium face"],
    ["小面", "Small face"],
    ["抛重估算", "Volumetric weight"],
    ["体积重量 = 外尺寸乘积 ÷ 抛比（外尺寸由当前刀模尺寸换算估算）", "Volumetric weight = outer dimensions product ÷ ratio (estimated from current dieline dimensions)"],
    ["三边和限制 cm", "Side-sum limit (cm)"],
    ["抛比", "Dimensional ratio"],
    ["已超抛，抛重为：", "Over limit, volumetric weight:"],
    ["展开宽", "Blank width"],
    ["展开高", "Blank height"],
    ["下载 SVG", "Download SVG"],
    ["下载 PDF", "Download PDF"],
    ["刀模预览", "Dieline preview"],
    ["二维刀模图", "2D dieline"],
    ["刀模文件名（可改，下载时自动加 .svg / .pdf）", "Dieline filename (editable; .svg / .pdf added on download)"],
    ["刀线", "Cut line"],
    ["压痕线", "Crease line"],
    ["注意", "Note"],
    ["首次投产前先打样核对。", "Make a sample and verify before first production."],
    ["注意：首次投产前先打样核对。", "Note: make a sample and verify before first production."],
    ["超范围", "Out of range"],
    ["超幅面", "Exceeds sheet"],
    ["未超抛", "Within limit"],
    ["文件名", "Filename"],
    ["日期", "Date"],
    ["纸厚", "Caliper"],
    ["过抛", "Volumetric limit"],
    ["刀模尺寸", "Dieline size"],
  ]);

  const originals = new WeakMap();
  let language = "zh";
  try {
    language = localStorage.getItem("packaging-dieline-language") || "zh";
  } catch {}

  function translate(value) {
    const leading = value.match(/^\s*/)?.[0] || "";
    const trailing = value.match(/\s*$/)?.[0] || "";
    const text = value.trim();
    if (!text) return value;
    if (exact.has(text)) return leading + exact.get(text) + trailing;
    let m = text.match(/^长 L（(.+)）$/);
    if (m) return `${leading}Length L (${m[1]})${trailing}`;
    m = text.match(/^宽 W（(.+)）$/);
    if (m) return `${leading}Width W (${m[1]})${trailing}`;
    m = text.match(/^高 D（(.+)）$/);
    if (m) return `${leading}Height D (${m[1]})${trailing}`;
    m = text.match(/^([A-Z] 楞) (\d+(?:\.\d+)?)$/);
    if (m) return `${leading}${m[1].replace("楞", " flute")} ${m[2]}${trailing}`;
    m = text.match(/^已超抛（三边和 (.+)cm > (.+)cm），抛重为：$/);
    if (m) return `${leading}Over limit (side sum ${m[1]} cm > ${m[2]} cm), volumetric weight:${trailing}`;
    m = text.match(/^三边和 (.+) cm$/);
    if (m) return `${leading}Side sum ${m[1]} cm${trailing}`;
    m = text.match(/^刀模展开(.+)×(.+)mm，超过材料幅面 (.+)×(.+)mm：一张纸印不下，需与供应商确认分张或拼接方案。$/);
    if (m) return `${leading}Dieline ${m[1]} × ${m[2]} mm exceeds the ${m[3]} × ${m[4]} mm sheet: confirm splitting or splicing with the supplier.${trailing}`;
    m = text.match(/^宽 W 必须比长 L 小 2mm 以上：(.+)$/);
    if (m) return `${leading}Width W must be at least 2 mm smaller than length L: ${m[1]}${trailing}`;
    m = text.match(/^(.+)超出已验证范围（(.+)–(.+) mm），该尺寸尚未校准，不能生成刀模$/);
    if (m) return `${leading}${m[1]} is outside the verified range (${m[2]}–${m[3]} mm); this size is not calibrated and cannot generate a dieline${trailing}`;
    m = text.match(/^刀线轮廓未闭合：(.+) 段未能串联$/);
    if (m) return `${leading}Dieline contour is not closed: ${m[1]} segments could not be joined${trailing}`;
    m = text.match(/^([0-9.]+)个\/张$/);
    if (m) return `${leading}${m[1]} / sheet${trailing}`;
    m = text.match(/^抛重 (.+) kg$/);
    if (m) return `${leading}Volumetric weight ${m[1]} kg${trailing}`;
    if (text === "请输入有效的尺寸。") return `${leading}Enter valid dimensions.${trailing}`;
    if (text === "刀线轮廓首尾不相接") return `${leading}Dieline contour is not closed${trailing}`;
    if (text === "canvas does not contain geometry：声明画布无法容纳全部刀模坐标，已拒绝导出") {
      return `${leading}Canvas does not contain the geometry; export refused.${trailing}`;
    }
    return value;
  }

  function visit(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (!originals.has(node)) originals.set(node, node.nodeValue);
      const original = originals.get(node);
      const next = language === "en" ? translate(original) : original;
      if (node.nodeValue !== next) node.nodeValue = next;
    }
  }

  function translateAttributes() {
    for (const element of document.querySelectorAll("[aria-label]")) {
      if (!element.dataset.zhAria) element.dataset.zhAria = element.getAttribute("aria-label");
      const original = element.dataset.zhAria;
      element.setAttribute("aria-label", language === "en" ? translate(original) : original);
    }
  }

  function apply() {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    document.title = language === "en" ? "Packaging Dieline Generator" : "包装刀模生成器";
    visit(document.body);
    translateAttributes();
    toggle.textContent = language === "en" ? "中文" : "EN";
    toggle.setAttribute("aria-label", language === "en" ? "Switch to Chinese" : "切换到英文");
    toggle.title = toggle.getAttribute("aria-label");
    try { localStorage.setItem("packaging-dieline-language", language); } catch {}
  }

  const style = document.createElement("style");
  style.textContent = `
    .language-toggle { margin-left: 12px; border: 1px solid #cbd2d9; border-radius: 6px; background: transparent; color: inherit; padding: 5px 9px; font: inherit; font-size: 12px; cursor: pointer; }
    .language-toggle:hover { background: rgba(255,255,255,.12); }
  `;
  document.head.appendChild(style);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "language-toggle";
  toggle.addEventListener("click", () => {
    language = language === "en" ? "zh" : "en";
    apply();
  });
  document.querySelector(".topbar")?.appendChild(toggle);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") {
        if (!originals.has(record.target)) originals.set(record.target, record.target.nodeValue);
        const original = originals.get(record.target);
        const next = language === "en" ? translate(original) : original;
        if (record.target.nodeValue !== next) record.target.nodeValue = next;
      } else {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) visit(node);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  apply();
})();
