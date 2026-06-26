import { generateCombinations } from "../server/design-matrix.js";

const N = 2000;
const counts = {};
for (let i = 0; i < N; i++) {
  const c = generateCombinations(1, "")[0];
  for (const k of ["a", "b", "c", "d", "e", "f", "g"]) {
    const id = c[k].id;
    counts[id] = (counts[id] || 0) + 1;
  }
}

const banned = ["A9", "A17", "A20", "C15", "E7", "E16"];
const leaked = banned.filter((b) => counts[b]);
console.log("禁用项是否泄漏(应为空):", leaked.length ? leaked.map((b) => `${b}:${counts[b]}`) : "无泄漏 OK");

function dump(prefix) {
  const rows = Object.entries(counts)
    .filter(([k]) => k.startsWith(prefix))
    .sort((a, b) => b[1] - a[1]);
  console.log(`\n--- ${prefix} 维度出现次数(共${N}次/维度) ---`);
  for (const [k, v] of rows) console.log(`${k}: ${v} (${((v / N) * 100).toFixed(1)}%)`);
}
dump("A");
dump("D");
dump("E");

// 验证 10 张批量去重
const batch = generateCombinations(10, "");
const keys = new Set(batch.map((b) => b.key));
console.log(`\n批量10张去重: ${keys.size}/10 ${keys.size === 10 ? "OK" : "有重复"}`);
console.log("示例标签:", batch.slice(0, 3).map((b) => b.key).join(" | "));
