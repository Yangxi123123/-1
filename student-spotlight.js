const STORAGE_KEY = "employment-dashboard-state";
const PARSED_KEY = "employment-dashboard-last-parsed";

const elements = {
  studentList: document.getElementById("spotlightStudentList"),
  search: document.getElementById("spotlightSearch"),
  empty: document.getElementById("spotlightEmpty"),
  content: document.getElementById("spotlightContent"),
  name: document.getElementById("spotlightName"),
  major: document.getElementById("spotlightMajor"),
  score: document.getElementById("spotlightScore"),
  awardsCount: document.getElementById("spotlightAwardsCount"),
  awards: document.getElementById("spotlightAwards"),
  internshipTag: document.getElementById("spotlightInternshipTag"),
  internship: document.getElementById("spotlightInternship"),
  intentTitle: document.getElementById("spotlightIntentTitle"),
  intent: document.getElementById("spotlightIntent"),
  skillsTitle: document.getElementById("spotlightSkillsTitle"),
  skills: document.getElementById("spotlightSkills"),
  projectsTitle: document.getElementById("spotlightProjectsTitle"),
  projects: document.getElementById("spotlightProjects"),
  contributionTitle: document.getElementById("spotlightContributionTitle"),
  contribution: document.getElementById("spotlightContribution"),
  summary: document.getElementById("spotlightSummary"),
  recommendations: document.getElementById("spotlightRecommendations")
};

let currentIndex = 0;
let allStudents = [];

function sameStudent(a, b) {
  return a?.studentId && b?.studentId && a.studentId === b.studentId;
}

function loadStudents() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsedRaw = localStorage.getItem(PARSED_KEY);
  let students = [];
  try { students = JSON.parse(raw)?.students || []; } catch { students = []; }
  try {
    const parsedStudents = JSON.parse(parsedRaw);
    if (Array.isArray(parsedStudents)) {
      parsedStudents.forEach((parsedStudent) => {
        if (parsedStudent?.studentId && !students.some((student) => student.studentId === parsedStudent.studentId)) {
          students.unshift(parsedStudent);
        }
      });
    }
  } catch {}
  return students;
}
function calculateScore(student) {
  let score = 55;
  if (student.awards) score += 18;
  if (student.internship) score += 17;
  if (student.intent) score += 8;
  if (student.status === "已签约") score += 10;
  return Math.min(score, 98);
}
function splitText(value) {
  if (!value) return [];
  return value.split(/[；;、,，]/).map((item) => item.trim()).filter(Boolean);
}
function buildSummary(student) {
  const strengths = [];
  if (student.awards) strengths.push("具备竞赛或荣誉经历，学习能力与执行力更容易被企业识别");
  if (student.internship) strengths.push("已有实习经验，岗位适应期通常更短");
  if (student.skills) strengths.push("具备明确技能标签，岗位匹配效率更高");
  if (student.projects) strengths.push("有真实项目经历，便于展示实践能力");
  if (student.contribution) strengths.push("个人贡献清晰，更容易向企业说明价值");
  if (student.intent) strengths.push(`职业目标较清晰，偏向 ${student.intent}`);
  if (!strengths.length) strengths.push("当前基础信息已建立，建议继续补录奖项和实习经历以提升画像完整度");
  return strengths.join("；");
}
function buildRecommendations(student) {
  const items = [];
  const text = `${student.major || ""} ${student.intent || ""} ${student.internship || ""}`.toLowerCase();
  if (text.includes("数据")) items.push("数据分析师 / BI 分析师");
  if (text.includes("算法") || text.includes("人工智能") || text.includes("视觉")) items.push("算法工程师 / 计算机视觉工程师");
  if (text.includes("软件") || text.includes("后端") || text.includes("云")) items.push("后端开发工程师 / 云平台工程师");
  if (text.includes("制造") || text.includes("机械")) items.push("工艺优化工程师 / 智能制造工程师");
  if (!items.length) items.push("综合运营岗 / 储备干部");
  return items;
}
function getFilteredStudents() {
  const keyword = (elements.search?.value || "").trim().toLowerCase();
  if (!keyword) return allStudents;
  return allStudents.filter((student) => `${student.name || ""} ${student.studentId || ""}`.toLowerCase().includes(keyword));
}

function renderStudentList(students) {
  const currentStudent = students[currentIndex] || students[0];
  elements.studentList.innerHTML = students.map((student, index) => `<button type="button" class="student-chip ${sameStudent(student, currentStudent) ? "active" : ""}" data-index="${index}"><strong>${student.name}</strong><span>${student.studentId || "学号待补充"} · ${student.major || "专业待补充"}</span></button>`).join("");
  elements.studentList.querySelectorAll(".student-chip").forEach((button) => {
    button.addEventListener("click", () => {
      currentIndex = Number(button.dataset.index);
      renderSpotlight();
    });
  });
}
function renderDetail(student) {
  const awards = splitText(student.awards);
  elements.empty.classList.add("hidden");
  elements.content.classList.remove("hidden");
  elements.name.textContent = student.name || "未命名学生";
  elements.major.textContent = `${student.major || "专业待补充"} | 学号 ${student.studentId || "待补充"} | ${student.status || "状态待补充"}`;
  elements.score.textContent = calculateScore(student);
  elements.awardsCount.textContent = `${awards.length || 0} 项`;
  elements.awards.textContent = student.awards || "暂无";
  elements.internshipTag.textContent = student.internship ? "已有实习经历" : "待补充";
  elements.internship.textContent = student.internship || "暂无";
  elements.intentTitle.textContent = student.intent || "待确认";
  elements.intent.textContent = `就业单位：${student.company || "未签约"}；期望月薪：${student.salary ? `￥${student.salary}` : "待确认"}`;
  elements.skillsTitle.textContent = student.skills ? "已补充技能" : "待补充";
  elements.skills.textContent = student.skills || "暂无";
  elements.projectsTitle.textContent = student.projects ? "已补充项目" : "待补充";
  elements.projects.textContent = student.projects || "暂无";
  elements.contributionTitle.textContent = student.contribution ? "已补充贡献" : "待补充";
  elements.contribution.textContent = student.contribution || "暂无";
  elements.summary.textContent = buildSummary(student);
  elements.recommendations.innerHTML = buildRecommendations(student).map((item) => `<div class="analysis-item"><strong>${item}</strong></div>`).join("");
}
function renderSpotlight() {
  allStudents = loadStudents();
  const students = getFilteredStudents();
  if (currentIndex >= students.length) currentIndex = 0;
  renderStudentList(students);
  if (!students.length) {
    elements.empty.classList.remove("hidden");
    elements.content.classList.add("hidden");
    return;
  }
  renderDetail(students[currentIndex] || students[0]);
}
if (elements.search) {
  elements.search.addEventListener("input", () => {
    currentIndex = 0;
    renderSpotlight();
  });
}
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY || event.key === PARSED_KEY) renderSpotlight();
});
renderSpotlight();
