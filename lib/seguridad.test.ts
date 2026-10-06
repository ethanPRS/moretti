import { afterEach, describe, expect, it, vi } from "vitest";
import { anotarFalla, bloqueadoPor, crearLimite } from "./limite-intentos";
import { ipCliente } from "./ip";
import { crearToken, verificarToken } from "./sesion";

describe("seguridad · límites de intentos", () => {
  it("bloquea al llegar al máximo y libera al pasar la ventana", () => {
    const l = crearLimite(3, 1000);
    for (let i = 0; i < 3; i++) l.anotar("a", 0);
    expect(l.bloqueadoPor("a", 10)).toBe(990);
    expect(l.bloqueadoPor("b", 10)).toBe(0);
    expect(l.bloqueadoPor("a", 1001)).toBe(0);
  });

  it("login: rotar la IP no esquiva el tope global (H-4)", () => {
    const t = 1_000_000;
    for (let i = 0; i < 50; i++) anotarFalla(`10.0.0.${i}`, t);
    expect(bloqueadoPor("10.9.9.9", t + 1)).toBeGreaterThan(0);
  });
});

describe("seguridad · IP del cliente (H-4)", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("sin CONFIAR_PROXY, X-Forwarded-For no cuenta: cualquiera lo puede inventar", () => {
    vi.stubEnv("CONFIAR_PROXY", "");
    expect(ipCliente(new Headers({ "x-forwarded-for": "1.2.3.4" }))).toBe("sin-proxy");
  });
  it("con CONFIAR_PROXY=1 (detrás de Vercel), sí", () => {
    vi.stubEnv("CONFIAR_PROXY", "1");
    expect(ipCliente(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });
});

describe("seguridad · sesión firmada", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("un token alterado, de otra llave o vencido no pasa", async () => {
    vi.stubEnv("SESSION_SECRET", "a".repeat(40));
    const token = await crearToken();
    expect(await verificarToken(token)).toBe(true);

    const [payload, firma] = token.split(".");
    const otro = Buffer.from(JSON.stringify({ sub: "admin", exp: Date.now() + 9e9 })).toString("base64url");
    expect(await verificarToken(`${otro}.${firma}`)).toBe(false);
    expect(await verificarToken(`${payload}.x${firma.slice(1)}`)).toBe(false);
    expect(await verificarToken("basura")).toBe(false);

    vi.stubEnv("SESSION_SECRET", "b".repeat(40));
    expect(await verificarToken(token)).toBe(false);

    vi.stubEnv("SESSION_SECRET", "a".repeat(40));
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 9 * 60 * 60 * 1000);
    expect(await verificarToken(token)).toBe(false);
    vi.useRealTimers();
  });

  it("sin SESSION_SECRET o con uno corto no se emiten tokens", async () => {
    vi.stubEnv("SESSION_SECRET", "corto");
    await expect(crearToken()).rejects.toThrow(/SESSION_SECRET/);
  });
});
