export type GenerateCount = number;
export type ImageEngine = "image2" | "seedance" | "seedream";

export type CoverResult = {
  id: number;
  combination: string;
  label: string;
  description?: string;
  image_url?: string;
  error?: string;
  engine?: ImageEngine;
  ratio?: string;
  group?: string; // 任务队列里所属任务的名称（用于分组显示）
};

export type CoverPlan = {
  id: number;
  combination: string;
  label: string;
  description?: string;
  prompt?: string;
};

export type TitlePlan = {
  direction: string;
  xiaohongshu: string;
  videoTitle: string;
  videoTitleAlt: string;
  coverMain: string;
  coverSub: string;
};

export type GenerateEvent = {
  status: "analyzing" | "planning" | "planned" | "generating" | "done" | "error";
  progress: number;
  total: number;
  message?: string;
  result?: CoverResult;
  results?: CoverResult[];
  plans?: CoverPlan[];
  analysis?: Record<string, unknown>;
  engine?: ImageEngine;
};

export type HistoryBatch = {
  id: string;
  createdAt: string;
  title: string;
  subtitle: string;
  keywords?: string;
  publishTitle?: string;
  publishPlatform?: "xiaohongshu" | "douyin";
  engine?: ImageEngine;
  count: GenerateCount;
  baseImage: string;
  results: CoverResult[];
};
