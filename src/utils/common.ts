const MISSING_FIELD = "\u0000";

// ${} 语法
// 支持data多层
// 不存在的字段会连同它前面的分隔符一起去掉，而不是写出 undefined
export const replaceTemplate = (template: string, data: any) => {
  const filled = template.replace(/\${([\w.]+)}/g, (_, key) => {
    let value = data;
    for (const k of key.split(".")) {
      value = value?.[k];
    }
    const isMissing =
      value === undefined ||
      value === null ||
      value === "" ||
      Number.isNaN(value);
    return isMissing ? MISSING_FIELD : String(value);
  });
  return filled.replace(/[_\-. ]?\u0000/g, "").replace(/^[_\-. ]+/, "");
};

export const completeSuffix = (filename: string, suffix: string) => {
  if (!filename.toLowerCase().endsWith(`.${suffix.toLowerCase()}`)) {
    return `${filename}.${suffix}`;
  }
  return filename;
};

// 去掉文件系统不允许的字符并限制长度，结果可能为空字符串
export const sanitizeFileName = (name: unknown, maxLength = 100) => {
  const cleaned = String(name ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .trim();
  return Array.from(cleaned)
    .slice(0, maxLength)
    .join("")
    .replace(/[. ]+$/, "");
};

export const buildFileName = (
  template: string,
  data: any,
  suffix: string,
  fallback: string,
) => {
  const base =
    sanitizeFileName(replaceTemplate(template, data), 150) ||
    sanitizeFileName(fallback) ||
    "未命名";
  return completeSuffix(base, suffix);
};

export const buildFolderName = (name: unknown, fallback?: string) => {
  return `${sanitizeFileName(name, 50) || sanitizeFileName(fallback, 50) || "未命名"}/`;
};

// 同名文件追加 (2)、(3)...，避免 zip 内文件名冲突
export const uniqueName = (name: string, used: Set<string>) => {
  let candidate = name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; used.has(candidate.toLowerCase()); i++) {
    candidate = `${base} (${i})${ext}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
};

export const buildZipName = (convName?: string, date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  const timestamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return ["豆包下载", sanitizeFileName(convName, 40), timestamp]
    .filter(Boolean)
    .join("_");
};
