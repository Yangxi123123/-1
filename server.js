import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");
  envText.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index < 0) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  });
}

const port = Number(process.env.PORT || 3000);

const llmBaseUrl = (process.env.LLM_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/+$/, "");
const llmApiKey = process.env.LLM_API_KEY || "";
const llmModel = process.env.LLM_MODEL || "doubao-seed-2.0-mini-260215";

const sessionCookieName = "employment_session";
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "Employment@2026";
const adminDisplayName = process.env.ADMIN_DISPLAY_NAME || "系统管理员";

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "employment_tracker",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres"
});

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((pair) => {
        const index = pair.indexOf("=");
        return [pair.slice(0, index), decodeURIComponent(pair.slice(index + 1))];
      })
  );
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${sessionCookieName}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 8}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${sessionCookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, original] = stored.split(":");
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(original, "hex"));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function mapStudent(row) {
  return {
    id: row.id,
    name: row.name,
    studentId: row.student_id,
    major: row.major,
    awards: row.awards,
    internship: row.internship,
    skills: row.skills,
    projects: row.projects,
    contribution: row.contribution,
    intent: row.intent,
    company: row.company,
    salary: Number(row.salary || 0),
    status: row.status,
    source: row.source,
    summary: row.summary
  };
}

async function requireAuth(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[sessionCookieName];
  if (!token) {
    sendJson(res, 401, { error: "未登录或登录已过期" });
    return null;
  }

  const result = await pool.query(
    `SELECT s.user_id, s.expires_at, u.username, u.display_name, u.role
     FROM user_sessions s
     JOIN app_users u ON u.id = s.user_id
     WHERE s.session_token = $1`,
    [token]
  );

  const session = result.rows[0];
  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    clearSessionCookie(res);
    sendJson(res, 401, { error: "会话已过期，请重新登录" });
    return null;
  }

  return {
    id: session.user_id,
    username: session.username,
    displayName: session.display_name,
    role: session.role
  };
}

async function ensureDefaultAdmin() {
  const existing = await pool.query("SELECT id FROM app_users WHERE username = $1", [adminUsername]);
  if (existing.rows[0]) return;

  await pool.query(
    `INSERT INTO app_users (username, display_name, role, password_hash)
     VALUES ($1, $2, 'admin', $3)`,
    [adminUsername, adminDisplayName, hashPassword(adminPassword)]
  );
}

function extractOutputText(result) {
  return (
    result.output_text ||
    result.output?.find((item) => item.type === "message")?.content?.find((item) => item.type === "output_text")?.text ||
    result.output?.find((item) => item.type === "message")?.content?.[0]?.text ||
    "{}"
  );
}

function normalizeStudentId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw
    .replace(/[ＯO〇o]/g, "0")
    .replace(/[ＩIl丨|]/g, "1")
    .replace(/[—－_]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  const matched = normalized.match(/[A-Z0-9]{8,20}/);
  return matched ? matched[0] : normalized;
}

function tryParseJson(text) {
  const raw = String(text || "").trim();
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {}

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const sliced = cleaned.slice(firstBrace, lastBrace + 1);
    return JSON.parse(sliced);
  }

  throw new Error(`模型返回内容不是合法 JSON：${cleaned.slice(0, 300)}`);
}

async function parseResumeWithLlm(file) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string" },
      studentId: { type: "string" },
      major: { type: "string" },
      awards: { type: "string" },
      internship: { type: "string" },
      skills: { type: "string" },
      projects: { type: "string" },
      contribution: { type: "string" },
      intent: { type: "string" },
      company: { type: "string" },
      salary: { type: "number" },
      status: { type: "string" },
      summary: { type: "string" }
    },
    required: ["name", "studentId", "major", "awards", "internship", "skills", "projects", "contribution", "intent", "company", "salary", "status", "summary"]
  };

  const response = await fetch(`${llmBaseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${llmApiKey}`
    },
    body: JSON.stringify({
      model: llmModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "你是高校就业系统的简历解析助手。请完整提取 PDF 简历中的学生姓名、学号、专业、奖项情况、实习经历、掌握技能、项目经历、个人贡献、就业意向、就业单位、月薪和状态。姓名必须优先从简历正文中提取，不允许根据文件名猜测姓名。如果无法识别姓名，返回 待人工确认姓名。不要遗漏长文本，要尽量保留原始关键信息。字段缺失时使用空字符串或 0 填充，状态默认返回待就业。"
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: file.name,
              file_data: `data:${file.mimeType || "application/pdf"};base64,${file.data}`
            },
            {
              type: "input_text",
              text: "请只返回符合 schema 的 JSON，不要返回任何额外解释。"
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "student_resume_extract",
          schema
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new Error(`方舟认证失败，请检查 LLM_API_KEY 是否正确。原始错误：${errorText}`);
    }
    if (response.status === 400) {
      throw new Error(`方舟接口参数错误，请检查 LLM_BASE_URL、LLM_MODEL 或请求体格式。原始错误：${errorText}`);
    }
    throw new Error(`方舟简历解析失败：${errorText}`);
  }

  const result = await response.json();
  const parsed = tryParseJson(extractOutputText(result));

  return {
    id: crypto.randomUUID(),
    name: parsed.name || "待人工确认姓名",
    studentId: normalizeStudentId(parsed.studentId) || `AUTO${Date.now().toString().slice(-6)}`,
    major: parsed.major || "",
    awards: parsed.awards || "",
    internship: parsed.internship || "",
    skills: parsed.skills || "",
    projects: parsed.projects || "",
    contribution: parsed.contribution || "",
    intent: parsed.intent || "",
    company: parsed.company || "未签约",
    salary: Number(parsed.salary) || 0,
    status: parsed.status || "待就业",
    source: file.name,
    summary: parsed.summary || "由火山方舟豆包模型自动解析生成"
  };
}

async function handleApi(req, res) {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.url === "/api/auth/login" && req.method === "POST") {
    const { username, password } = await readBody(req);
    const result = await pool.query("SELECT * FROM app_users WHERE username = $1", [username]);
    const user = result.rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return sendJson(res, 401, { error: "用户名或密码错误" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO user_sessions (user_id, session_token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '8 hours')",
      [user.id, token]
    );
    setSessionCookie(res, token);
    return sendJson(res, 200, {
      ok: true,
      user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role }
    });
  }

  if (req.url === "/api/auth/me" && req.method === "GET") {
    const user = await requireAuth(req, res);
    if (!user) return;
    return sendJson(res, 200, { user });
  }

  if (req.url === "/api/auth/logout" && req.method === "POST") {
    const cookies = parseCookies(req);
    if (cookies[sessionCookieName]) {
      await pool.query("DELETE FROM user_sessions WHERE session_token = $1", [cookies[sessionCookieName]]);
    }
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.url === "/api/health" && req.method === "GET") {
    return sendJson(res, 200, { ok: true, user });
  }

  if (req.url === "/api/bootstrap" && req.method === "GET") {
    try {
      const [students, enterprises] = await Promise.all([
        pool.query("SELECT * FROM students ORDER BY updated_at DESC"),
        pool.query("SELECT * FROM enterprises ORDER BY updated_at DESC")
      ]);
      return sendJson(res, 200, {
        students: students.rows.map(mapStudent),
        enterprises: enterprises.rows,
        parsed_students: []
      });
    } catch (error) {
      return sendJson(res, 500, { error: error.message, students: [], enterprises: [], parsed_students: [] });
    }
  }

  if (req.url === "/api/students/bulk" && req.method === "POST") {
    try {
      const { students = [] } = await readBody(req);
      for (const student of students) {
        await pool.query(
          `INSERT INTO students (id, name, student_id, major, awards, internship, skills, projects, contribution, intent, company, salary, status, source, summary, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
           ON CONFLICT (student_id) DO UPDATE SET
             name = EXCLUDED.name,
             major = EXCLUDED.major,
             awards = EXCLUDED.awards,
             internship = EXCLUDED.internship,
             skills = EXCLUDED.skills,
             projects = EXCLUDED.projects,
             contribution = EXCLUDED.contribution,
             intent = EXCLUDED.intent,
             company = EXCLUDED.company,
             salary = EXCLUDED.salary,
             status = EXCLUDED.status,
             source = EXCLUDED.source,
             summary = EXCLUDED.summary,
             updated_at = NOW()`,
          [
            student.id || crypto.randomUUID(),
            student.name,
            student.studentId,
            student.major,
            student.awards || "",
            student.internship || "",
            student.skills || "",
            student.projects || "",
            student.contribution || "",
            student.intent || "",
            student.company || "",
            Number(student.salary) || 0,
            student.status || "待就业",
            student.source || "",
            student.summary || ""
          ]
        );
      }
      return sendJson(res, 200, { ok: true, count: students.length });
    } catch (error) {
      return sendJson(res, 500, { error: error.message });
    }
  }

  if (req.url === "/api/enterprises/bulk" && req.method === "POST") {
    try {
      const { enterprises = [] } = await readBody(req);
      for (const enterprise of enterprises) {
        await pool.query(
          `INSERT INTO enterprises (id, name, industry, roles, status, needs, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW())
           ON CONFLICT (name) DO UPDATE SET
             industry = EXCLUDED.industry,
             roles = EXCLUDED.roles,
             status = EXCLUDED.status,
             needs = EXCLUDED.needs,
             updated_at = NOW()`,
          [
            enterprise.id || crypto.randomUUID(),
            enterprise.name,
            enterprise.industry,
            enterprise.roles,
            enterprise.status,
            enterprise.needs || ""
          ]
        );
      }
      return sendJson(res, 200, { ok: true, count: enterprises.length });
    } catch (error) {
      return sendJson(res, 500, { error: error.message });
    }
  }

  if (req.url === "/api/llm/parse" && req.method === "POST") {
    try {
      if (!llmApiKey) {
        return sendJson(res, 400, { error: "未配置 LLM_API_KEY，请先设置火山方舟 API Key。" });
      }
      const { files = [] } = await readBody(req);
      if (!Array.isArray(files) || !files.length) {
        return sendJson(res, 400, { error: "未收到可解析的 PDF 文件。" });
      }

      const students = [];
      for (const file of files) {
        students.push(await parseResumeWithLlm(file));
      }
      return sendJson(res, 200, { students });
    } catch (error) {
      return sendJson(res, 500, { error: error.message });
    }
  }

  return sendJson(res, 404, { error: "Not found" });
}

function serveStatic(req, res) {
  const targetPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(targetPath).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(__dirname, safePath);

  if (!fullPath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(fullPath)] || "text/plain; charset=utf-8" });
    res.end(data);
  });
}

async function start() {
  await ensureDefaultAdmin();
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/api/")) {
      handleApi(req, res);
      return;
    }
    serveStatic(req, res);
  });

  server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
