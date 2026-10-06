/**
 * La base de datos de las pruebas de integración. Nunca es la de desarrollo:
 * cada prueba la vacía antes de empezar.
 *
 * Se toma de DATABASE_URL_PRUEBAS si existe; si no, se deriva de DATABASE_URL
 * cambiando el nombre de la base (moretti_dev → moretti_pruebas). El candado
 * de abajo es a propósito: si el nombre no termina en _pruebas o _test, no
 * se corre nada, para que un .env mal copiado no borre la base de nadie.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function urlBaseDePruebas(env) {
  const origen = env.DATABASE_URL_PRUEBAS ?? derivar(env.DATABASE_URL);
  const url = new URL(origen);
  const nombre = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/_(pruebas|test)$/.test(nombre)) {
    throw new Error(
      `La base de pruebas se llama «${nombre}». Por seguridad su nombre tiene que terminar en _pruebas o _test: las pruebas la vacían.`
    );
  }
  return url.toString();
}

/** @param {string | undefined} urlDesarrollo */
function derivar(urlDesarrollo) {
  if (!urlDesarrollo) {
    throw new Error(
      "Falta DATABASE_URL (o DATABASE_URL_PRUEBAS) en .env: las pruebas de integración necesitan Postgres."
    );
  }
  const url = new URL(urlDesarrollo);
  const nombre = url.pathname.replace(/^\//, "").replace(/_dev$/, "");
  url.pathname = `/${nombre}_pruebas`;
  return url.toString();
}
