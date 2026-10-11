import { beforeAll, describe, expect, it } from "vitest";
import { tokenApartado, verificarApartado } from "./apartado";

beforeAll(() => {
  process.env.SESSION_SECRET ??= "x".repeat(40);
});

describe("token del apartado (H-2)", () => {
  it("sirve para su plan y no para otro", async () => {
    const t = await tokenApartado("plan_a");
    expect(await verificarApartado("plan_a", t)).toBe(true);
    expect(await verificarApartado("plan_b", t)).toBe(false);
  });

  it("vence a las dos horas", async () => {
    const t = await tokenApartado("plan_a", 0);
    expect(await verificarApartado("plan_a", t, 2 * 60 * 60 * 1000 - 1)).toBe(true);
    expect(await verificarApartado("plan_a", t, 2 * 60 * 60 * 1000 + 1)).toBe(false);
  });

  it("un token alterado, vacío o sin firma no pasa", async () => {
    const t = await tokenApartado("plan_a");
    const [exp, firma] = t.split(".");
    expect(await verificarApartado("plan_a", `${Number(exp) + 1}.${firma}`)).toBe(false);
    expect(await verificarApartado("plan_a", `${exp}.`)).toBe(false);
    expect(await verificarApartado("plan_a", "")).toBe(false);
    expect(await verificarApartado("plan_a", null)).toBe(false);
  });
});
