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
  物理: {
    skillDir: "physics-tutor",
    // 福建/浙江/江苏/北京等省自主命题，题型按模块归一
    problemTypes: ["力学综合", "运动图像", "电磁场", "电磁感应", "实验", "近代物理", "概念多选"],
    viz: true, // 受力图 / 运动图像
  },
  化学: {
    skillDir: "chem-tutor",
    // 与物理同为省自主命题（福建/浙江/江苏/北京等）
    problemTypes: ["反应原理", "电化学", "化学平衡", "工艺流程", "有机推断", "物质结构", "化学实验", "离子反应"],
    viz: true, // 反应能量图（能垒图）
  },
};

export const DEFAULT_SUBJECT = "数学";

/** 用户输入的科目名归一到已支持科目；未支持返回 null */
export function resolveSubject(input: string): string | null {
  const s = input.trim();
  return SUBJECTS[s] ? s : null;
}

export const supportedSubjects = (): string[] => Object.keys(SUBJECTS);
