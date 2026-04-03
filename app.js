const STORAGE_KEY = "employment-dashboard-state";
const PARSED_KEY = "employment-dashboard-last-parsed";
const API_BASE = "/api";

const initialState = {
  enterprises: [],
  students: []
};

const elements = {
  loginScreen: document.getElementById("loginScreen"),
  dashboard: document.getElementById("dashboard"),
  loginForm: document.getElementById("loginForm"),
  authMessage: document.getElementById("authMessage"),
  usernameInput: document.getElementById("usernameInput"),
  passwordInput: document.getElementById("passwordInput"),
  logoutBtn: document.getElementById("logoutBtn"),
  sessionStatus: document.getElementById("sessionStatus"),
  dbStatus: document.getElementById("dbStatus"),
  overviewCards: document.getElementById("overviewCards"),
  enterpriseForm: document.getElementById("enterpriseForm"),
  enterpriseTable: document.getElementById("enterpriseTable"),
  studentForm: document.getElementById("studentForm"),
  studentTable: document.getElementById("studentTable"),
  analysisGrid: document.getElementById("analysisGrid"),
  insightCard: document.getElementById("insightCard"),
  recommendationStudent: document.getElementById("recommendationStudent"),
  recommendationCard: document.getElementById("recommendationCard"),
  runRecommendationBtn: document.getElementById("runRecommendationBtn"),
  seedEnterpriseBtn: document.getElementById("seedEnterpriseBtn"),
  seedStudentBtn: document.getElementById("seedStudentBtn"),
  refreshAnalysisBtn: document.getElementById("refreshAnalysisBtn"),
  refreshDbBtn: document.getElementById("refreshDbBtn"),
  pdfInput: document.getElementById("pdfInput"),
  parsePdfBtn: document.getElementById("parsePdfBtn"),
  parseResult: document.getElementById("parseResult"),
  parsedHighlight: document.getElementById("parsedHighlight"),
  selectedFileText: document.getElementById("selectedFileText"),
  llmMode: document.getElementById("llmMode"),
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  selectionSummary: document.getElementById("selectionSummary"),
  strengthPreview: document.getElementById("strengthPreview")
};

let state = loadState();
let parsedStudents = loadParsedResult();
let selectedStudentId = state.students[0]?.id || null;
let currentUser = null;

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(initialState);
  try {
    return JSON.parse(raw);
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadParsedResult() {
  const raw = localStorage.getItem(PARSED_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveParsedResult(data) {
  parsedStudents = data;
  localStorage.setItem(PARSED_KEY, JSON.stringify(data));
}

function setAuthMessage(message, isError = false) {
  elements.authMessage.textContent = message;
  elements.authMessage.style.color = isError ? "#a53b14" : "#266a52";
}

function normalize(text) {
  return (text || "").toLowerCase();
}

function inferDirection(major) {
  const text = normalize(major);
  if (text.includes("数据")) return "数据分析 / 商业智能";
  if (text.includes("软件") || text.includes("计算机")) return "软件开发 / 测试";
  if (text.includes("机械") || text.includes("自动化")) return "智能制造 / 工艺优化";
  if (text.includes("人工智能")) return "机器学习 / 计算机视觉";
  return "综合管理 / 岗位待细分";
}

function formatStudent(data) {
  return {
    id: data.id || crypto.randomUUID(),
    name: data.name || "待人工确认姓名",
    studentId: data.studentId || `AUTO${Date.now().toString().slice(-6)}`,
    major: data.major || "待解析专业",
    awards: data.awards || "",
    internship: data.internship || "",
    skills: data.skills || "",
    projects: data.projects || "",
    contribution: data.contribution || "",
    intent: data.intent || inferDirection(data.major),
    company: data.company || "未签约",
    salary: Number(data.salary) || 0,
    status: data.status || "待就业",
    source: data.source || "",
    summary: data.summary || "已完成结构化抽取"
  };
}

function formatEnterprise(data) {
  return {
    id: data.id || crypto.randomUUID(),
    name: data.name,
    industry: data.industry,
    roles: data.roles,
    status: data.status,
    needs: data.needs || ""
  };
}

function average(numbers) {
  return numbers.length ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : 0;
}

function getSelectedStudent() {
  return state.students.find((student) => student.id === selectedStudentId) || state.students[0] || null;
}

function buildEnterpriseMatches(student) {
  if (!student) return [];
  return state.enterprises
    .map((enterprise) => {
      let score = 25;
      const studentText = normalize(`${student.major} ${student.intent} ${student.internship} ${student.awards}`);
      const enterpriseText = normalize(`${enterprise.industry} ${enterprise.roles} ${enterprise.needs}`);
      const reasons = [];

      ["数据", "算法", "软件", "云", "人工智能", "制造", "教育", "运营", "机械", "视觉"].forEach((keyword) => {
        if (studentText.includes(keyword) && enterpriseText.includes(keyword)) {
          score += 10;
          reasons.push(`匹配关键词：${keyword}`);
        }
      });

      if (student.awards) {
        score += 8;
        reasons.push("有奖项经历");
      }
      if (student.internship) {
        score += 12;
        reasons.push("有实习经验");
      }
      if (enterprise.status === "活跃招聘") {
        score += 10;
        reasons.push("企业当前活跃招聘");
      }

      return {
        ...enterprise,
        score,
        reason: reasons.slice(0, 3).join("，") || "基础方向匹配"
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(10, Math.max(5, state.enterprises.length)));
}

function calculateMatchingRate() {
  if (!state.students.length) return 0;
  const matched = state.students.filter((student) => buildEnterpriseMatches(student)[0]?.score >= 45).length;
  return Math.round((matched / state.students.length) * 100);
}

function renderOverview() {
  const signedCount = state.students.filter((student) => student.status === "已签约").length;
  const avgSalary = average(state.students.map((student) => Number(student.salary) || 0).filter(Boolean));
  const activeEnterprises = state.enterprises.filter((enterprise) => enterprise.status === "活跃招聘").length;
  const cards = [
    { label: "企业总数", value: state.enterprises.length, desc: `${activeEnterprises} 家企业处于活跃招聘` },
    { label: "学生档案", value: state.students.length, desc: `${signedCount} 人已签约` },
    { label: "专业对口率", value: `${calculateMatchingRate()}%`, desc: "基于学生优势与岗位标签联动计算" },
    { label: "平均月薪", value: avgSalary ? `￥${avgSalary}` : "待录入", desc: "仅统计已填薪资学生" }
  ];
  elements.overviewCards.innerHTML = cards.map((card) => `<article class="metric-card"><p class="eyebrow">${card.label}</p><strong>${card.value}</strong><p class="muted">${card.desc}</p></article>`).join("");
}

function renderStudentTable() {
  const renderTextCell = (text, fallback = "待补充") => `<div class="fold-cell">${text || fallback}</div>`;

  elements.studentTable.innerHTML = state.students.map((student) => `
    <tr class="${student.id === selectedStudentId ? "active-row" : ""}">
      <td><button type="button" class="name-button" data-student-id="${student.id}">${student.name}</button></td>
      <td>${student.studentId}</td>
      <td>${student.major}</td>
      <td>${renderTextCell(student.awards)}</td>
      <td>${renderTextCell(student.internship)}</td>
      <td>${renderTextCell(student.skills)}</td>
      <td>${renderTextCell(student.projects)}</td>
      <td>${renderTextCell(student.contribution)}</td>
      <td>${student.status}</td>
    </tr>
  `).join("") || `<tr><td colspan="9">暂无学生数据</td></tr>`;

  elements.studentTable.querySelectorAll(".name-button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedStudentId = button.dataset.studentId;
      renderStudentsAndEnterprises();
      renderRecommendation();
      renderStrengthPreview();
    });
  });
}

function renderEnterpriseTable() {
  const student = getSelectedStudent();
  const matches = buildEnterpriseMatches(student);
  elements.selectionSummary.textContent = student
    ? `当前已选学生：${student.name}（${student.studentId}），已推荐 ${matches.length} 家匹配企业。`
    : "请选择一个学生，查看匹配企业推荐。";
  elements.enterpriseTable.innerHTML = matches.map((enterprise) => `
    <tr>
      <td>${enterprise.name}</td>
      <td>${enterprise.industry}</td>
      <td>${enterprise.roles}</td>
      <td>${enterprise.reason}</td>
      <td>${enterprise.score}</td>
    </tr>
  `).join("") || `<tr><td colspan="5">暂无企业数据</td></tr>`;
}

function renderStudentsAndEnterprises() {
  renderStudentTable();
  renderEnterpriseTable();
}

function renderAnalysis() {
  const employmentRate = state.students.length ? Math.round((state.students.filter((s) => s.status === "已签约").length / state.students.length) * 100) : 0;
  const internshipRate = state.students.length ? Math.round((state.students.filter((s) => s.status === "实习中").length / state.students.length) * 100) : 0;
  const avgSalary = average(state.students.map((student) => Number(student.salary) || 0).filter(Boolean));
  const awardCoverage = state.students.filter((student) => student.awards).length;
  const items = [
    { title: "就业趋势", value: `${employmentRate}%`, desc: "当前签约占比，可持续跟踪年度变化。" },
    { title: "实习转化", value: `${internshipRate}%`, desc: "处于实习中的学生比例。" },
    { title: "薪资水平", value: avgSalary ? `￥${avgSalary}` : "待录入", desc: "用于评估毕业去向质量。" },
    { title: "专业对口率", value: `${calculateMatchingRate()}%`, desc: "基于学生画像与岗位需求的匹配率。" },
    { title: "奖项覆盖", value: `${awardCoverage} 人`, desc: "帮助识别高潜力学生群体。" },
    { title: "批量解析数", value: `${parsedStudents.length} 份`, desc: "当前已完成解析的简历数。" }
  ];
  elements.analysisGrid.innerHTML = items.map((item) => `<article class="analysis-item"><p class="eyebrow">${item.title}</p><strong>${item.value}</strong><p class="muted">${item.desc}</p></article>`).join("");
  elements.insightCard.innerHTML = `<strong>分析洞察</strong><p>当前签约率 ${employmentRate}% 、平均月薪 ${avgSalary ? `￥${avgSalary}` : "待补录"} 、专业对口率 ${calculateMatchingRate()}% 。建议持续补录奖项和实习经历，以提升推荐质量。</p>`;
}

function renderRecommendationOptions() {
  elements.recommendationStudent.innerHTML = state.students.map((student) => `<option value="${student.id}" ${student.id === selectedStudentId ? "selected" : ""}>${student.name} · ${student.major}</option>`).join("") || `<option value="">暂无学生数据</option>`;
}

function renderRecommendation() {
  const requestedId = elements.recommendationStudent.value || selectedStudentId;
  if (requestedId) selectedStudentId = requestedId;
  const student = getSelectedStudent();
  if (!student) {
    elements.recommendationCard.textContent = "暂无学生数据可供推荐。";
    return;
  }
  const ranked = buildEnterpriseMatches(student).slice(0, 5);
  elements.recommendationCard.innerHTML = `<strong>学生：</strong> ${student.name}（${student.studentId}）<br /><strong>预测方向：</strong> ${student.intent || inferDirection(student.major)}<br /><strong>预测质量：</strong> ${(student.awards || student.internship) ? "中高质量就业" : "稳定就业"}<br /><br /><strong>推荐企业：</strong><br />${ranked.map((item, index) => `${index + 1}. ${item.name} - ${item.roles}（匹配分 ${item.score}）`).join("<br />")}`;
}

function renderParsedSnapshot() {
  if (!parsedStudents.length) {
    elements.parsedHighlight.classList.add("hidden");
    return;
  }
  const latest = parsedStudents[0];
  elements.parsedHighlight.classList.remove("hidden");
  elements.parsedHighlight.innerHTML = `<strong>最近解析：</strong> ${latest.name} / ${latest.studentId}<br /><strong>奖项：</strong> ${latest.awards || "待补充"}<br /><strong>实习：</strong> ${latest.internship || "待补充"}`;
}

function renderStrengthPreview() {
  const student = getSelectedStudent() || parsedStudents[0];
  if (!student) {
    elements.strengthPreview.textContent = "暂无已解析学生。";
    return;
  }
  elements.strengthPreview.innerHTML = `<strong>${student.name}</strong><br />学号：${student.studentId}<br />奖项：${student.awards || "待补充"}<br />实习：${student.internship || "待补充"}<br />技能：${student.skills || "待补充"}<br />项目：${student.projects || "待补充"}<br />贡献：${student.contribution || "待补充"}<br />就业意向：${student.intent || "待确认"}`;
}

function renderAll() {
  saveState();
  renderOverview();
  renderStudentsAndEnterprises();
  renderAnalysis();
  renderRecommendationOptions();
  renderRecommendation();
  renderParsedSnapshot();
  renderStrengthPreview();
}

function serializeForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function fillStudentForm(data) {
  const fields = ["name", "studentId", "major", "awards", "internship", "skills", "projects", "contribution", "intent", "company", "salary", "status"];
  fields.forEach((key) => {
    const input = elements.studentForm.elements.namedItem(key);
    if (input) input.value = data[key] ?? "";
  });
}

function upsertStudentRecord(payload) {
  const student = formatStudent(payload);
  const index = state.students.findIndex((item) => item.studentId === student.studentId);
  if (index >= 0) state.students[index] = { ...state.students[index], ...student };
  else state.students.unshift(student);
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    let message = "请求失败";
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

async function fetchBootstrap() {
  const response = await api("/bootstrap");
  state.students = Array.isArray(response.students) ? response.students.map(formatStudent) : [];
  state.enterprises = Array.isArray(response.enterprises) ? response.enterprises.map(formatEnterprise) : [];
  saveParsedResult(Array.isArray(response.parsed_students) ? response.parsed_students.map(formatStudent) : parsedStudents);
  selectedStudentId = state.students[0]?.id || null;
  elements.dbStatus.textContent = "PostgreSQL 已连接";
}

async function syncStudentsToDatabase(students) {
  await api("/students/bulk", {
    method: "POST",
    body: JSON.stringify({ students })
  });
  elements.dbStatus.textContent = "PostgreSQL 已同步学生";
}

async function syncEnterprisesToDatabase() {
  await api("/enterprises/bulk", {
    method: "POST",
    body: JSON.stringify({ enterprises: state.enterprises })
  });
  elements.dbStatus.textContent = "PostgreSQL 已同步企业";
}

function buildMockStudentFromFile(file, index) {
  return formatStudent({
    name: `待人工确认姓名${index + 1}`,
    studentId: `2024${String(2001 + index).padStart(6, "0")}`,
    major: index % 2 === 0 ? "人工智能" : "数据科学与大数据技术",
    awards: index % 2 === 0 ? "全国大学生智能车竞赛二等奖" : "数学建模省一等奖",
    internship: index % 2 === 0 ? "智航机器人算法实习，负责目标检测与模型调优" : "数澜商业分析数据分析实习，负责报表和指标体系搭建",
    skills: index % 2 === 0 ? "Python、PyTorch、OpenCV、深度学习部署" : "Python、SQL、Pandas、Tableau、统计分析",
    projects: index % 2 === 0 ? "智能视觉缺陷检测系统；多模态校园问答助手" : "就业数据分析看板；企业招聘需求预测模型",
    contribution: index % 2 === 0 ? "独立完成模型训练、指标优化和推理接口封装" : "负责数据清洗、特征分析、报表搭建与趋势洞察输出",
    intent: index % 2 === 0 ? "机器学习 / 计算机视觉" : "数据分析 / 商业智能",
    company: "未签约",
    salary: 0,
    status: "待就业",
    source: file.name,
    summary: "已从 PDF 中提取奖项、实习经历和就业意向，已自动同步到学生信息收集板块。"
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

async function liveParsePdf(files) {
  const endpoint = elements.apiBaseUrl.value.trim() || `${API_BASE}/llm/parse`;
  const encodedFiles = await Promise.all(files.map(async (file) => ({
    name: file.name,
    mimeType: file.type || "application/pdf",
    data: await fileToBase64(file)
  })));
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: encodedFiles })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "LLM 解析失败" }));
    throw new Error(data.error || "LLM 解析失败");
  }
  const result = await response.json();
  return Array.isArray(result.students) ? result.students.map(formatStudent) : [];
}

async function handlePdfParsing() {
  const files = [...(elements.pdfInput.files || [])];
  if (!files.length) {
    elements.parseResult.textContent = "请先选择一个或多个 PDF 文件。";
    return;
  }
  elements.parseResult.textContent = "正在批量解析并同步，请稍候...";
  try {
    const parsed = elements.llmMode.value === "live"
      ? await liveParsePdf(files)
      : files.map((file, index) => buildMockStudentFromFile(file, index));
    parsed.forEach(upsertStudentRecord);
    saveParsedResult(parsed);
    saveState();
    selectedStudentId = parsed[0]?.id || selectedStudentId;
    fillStudentForm(parsed[0] || {});
    await syncStudentsToDatabase(parsed);
    renderAll();
    elements.parseResult.textContent = `${JSON.stringify(parsed, null, 2)}\n\n解析完成，已直接同步到学生就业信息收集板块。`;
  } catch (error) {
    elements.parseResult.textContent = `解析失败：${error.message}`;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  try {
    const username = elements.usernameInput.value.trim();
    const password = elements.passwordInput.value;
    const result = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    currentUser = result.user;
    elements.sessionStatus.textContent = currentUser.displayName || currentUser.username;
    elements.usernameInput.value = "";
    elements.passwordInput.value = "";
    setAuthMessage("认证通过，正在进入系统。");
    await fetchBootstrap();
    renderAuthState(true);
  } catch (error) {
    setAuthMessage(error.message, true);
  }
}

async function loadCurrentUser() {
  try {
    const result = await api("/auth/me");
    currentUser = result.user;
    elements.sessionStatus.textContent = currentUser.displayName || currentUser.username;
    await fetchBootstrap();
    renderAuthState(true);
  } catch {
    currentUser = null;
    renderAuthState(false);
  }
}

async function handleLogout() {
  try {
    await api("/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } catch {}
  currentUser = null;
  renderAuthState(false);
  setAuthMessage("已退出登录。");
}

function renderAuthState(authenticated) {
  elements.loginScreen.classList.toggle("hidden", authenticated);
  elements.dashboard.classList.toggle("hidden", !authenticated);
  elements.sessionStatus.textContent = authenticated ? (currentUser?.displayName || currentUser?.username || "已登录") : "未登录";
  if (authenticated) renderAll();
}

function handleStudentSubmit(event) {
  event.preventDefault();
  const payload = serializeForm(elements.studentForm);
  payload.salary = Number(payload.salary) || 0;
  upsertStudentRecord(payload);
  selectedStudentId = state.students[0]?.id || selectedStudentId;
  saveState();
  syncStudentsToDatabase(state.students).then(renderAll);
  elements.studentForm.reset();
}

function handleEnterpriseSubmit(event) {
  event.preventDefault();
  state.enterprises.unshift(formatEnterprise(serializeForm(elements.enterpriseForm)));
  syncEnterprisesToDatabase().then(renderAll);
  elements.enterpriseForm.reset();
}

function handleFileSelection() {
  const files = [...(elements.pdfInput.files || [])];
  elements.selectedFileText.textContent = files.length
    ? `已选择 ${files.length} 份文件：${files.map((file) => file.name).join("、")}`
    : "当前未选择文件";
}

function seedEnterpriseData() {
  state.enterprises = state.enterprises.concat([
    formatEnterprise({ name: "澄川教育科技", industry: "教育信息化", roles: "产品运营专员 / 数据标注主管", status: "储备合作", needs: "优先招聘教育技术、数据分析、新闻传播相关专业。" }),
    formatEnterprise({ name: "启域云计算", industry: "云计算", roles: "后端开发工程师 / 云运维工程师", status: "活跃招聘", needs: "需要计算机、软件工程、网络工程方向学生。" }),
    formatEnterprise({ name: "智航机器人", industry: "人工智能", roles: "视觉算法工程师 / 机器学习工程师", status: "活跃招聘", needs: "偏好人工智能、计算机视觉、自动化控制专业。" }),
    formatEnterprise({ name: "数澜商业分析", industry: "数据服务", roles: "数据分析师 / BI 顾问", status: "活跃招聘", needs: "偏好数据科学、统计学、经济学和商业分析背景。" }),
    formatEnterprise({ name: "拓元软件", industry: "软件研发", roles: "后端开发工程师 / 测试工程师", status: "活跃招聘", needs: "需要软件工程、计算机科学与技术方向学生。" })
  ]);
  syncEnterprisesToDatabase().then(renderAll);
}

function seedStudentData() {
  [
    formatStudent({ name: "周明远", studentId: "2024001002", major: "软件工程", awards: "蓝桥杯省二等奖", internship: "启域云计算后端实习", skills: "Java、Spring Boot、MySQL、Docker", projects: "校园活动报名系统；就业推荐后台", contribution: "负责后端接口设计、数据库建模与部署", intent: "后端开发 / 云平台", company: "启域云计算", salary: 13500, status: "已签约" }),
    formatStudent({ name: "顾清禾", studentId: "2024001003", major: "机械设计制造及其自动化", awards: "智能制造创新赛校一等奖", internship: "海岳智能制造工艺优化实习", skills: "SolidWorks、PLC、工业数据采集", projects: "智能产线节拍优化项目", contribution: "负责设备参数调优、工艺分析和现场落地测试", intent: "智能制造 / 生产优化", company: "未签约", salary: 0, status: "实习中" }),
    formatStudent({ name: "李沐辰", studentId: "2024001004", major: "人工智能", awards: "全国大学生智能车竞赛二等奖", internship: "智航机器人算法实习", skills: "Python、PyTorch、OpenCV、Linux", projects: "视觉目标检测平台；智能巡检机器人", contribution: "负责模型训练、误检分析和部署联调", intent: "机器学习 / 计算机视觉", company: "未签约", salary: 0, status: "待就业" })
  ].forEach(upsertStudentRecord);
  selectedStudentId = state.students[0]?.id || selectedStudentId;
  saveState();
  syncStudentsToDatabase(state.students).then(renderAll);
}

function initEvents() {
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.logoutBtn.addEventListener("click", handleLogout);
  elements.enterpriseForm.addEventListener("submit", handleEnterpriseSubmit);
  elements.studentForm.addEventListener("submit", handleStudentSubmit);
  elements.seedEnterpriseBtn.addEventListener("click", seedEnterpriseData);
  elements.seedStudentBtn.addEventListener("click", seedStudentData);
  elements.refreshAnalysisBtn.addEventListener("click", renderAnalysis);
  elements.refreshDbBtn.addEventListener("click", async () => { await fetchBootstrap(); renderAll(); });
  elements.runRecommendationBtn.addEventListener("click", renderRecommendation);
  elements.recommendationStudent.addEventListener("change", renderRecommendation);
  elements.pdfInput.addEventListener("change", handleFileSelection);
  elements.parsePdfBtn.addEventListener("click", handlePdfParsing);
}

function init() {
  initEvents();
  handleFileSelection();
  loadCurrentUser();
}

init();
