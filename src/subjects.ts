// 科目注册表——单一事实源。加新科目 = 加一条 + 放 skills/<skillDir>/SKILL.md。
export type SubjectConfig = {
  skillDir: string; // 对应 skills/<skillDir>/SKILL.md
  problemTypes: string[]; // 错题归档的题型枚举（喂给提炼 prompt）
  viz: boolean; // 是否支持几何/函数可视化（genSpec 是否运行）
};

export const SUBJECTS: Record<string, SubjectConfig> = {
  数学: {
    skillDir: "math-tutor",
    problemTypes: ["新定义", "数列", "概率统计", "导数", "解析几何", "立体几何", "开放题"],
    viz: true,
  },
};

export const DEFAULT_SUBJECT = "数学";

/** 用户输入的科目名归一到已支持科目；未支持返回 null */
export function resolveSubject(input: string): string | null {
  const s = input.trim();
  return SUBJECTS[s] ? s : null;
}

export const supportedSubjects = (): string[] => Object.keys(SUBJECTS);
