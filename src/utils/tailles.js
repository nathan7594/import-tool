// utils/tailles.js
// Deplie une plage de tailles en liste complete.
// Exemple : deplierTailles(46, 70) => [46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70]
// Les tailles grande taille vont de 2 en 2, c'est le pas par defaut.

export function deplierTailles(min, max, pas = 2) {
  const debut = Number(min);
  const fin = Number(max);

  if (Number.isNaN(debut) || Number.isNaN(fin)) {
    throw new Error(`Tailles invalides : min=${min}, max=${max}`);
  }
  if (debut > fin) {
    throw new Error(`La taille min (${debut}) est superieure a la taille max (${fin})`);
  }

  const tailles = [];
  for (let t = debut; t <= fin; t += pas) {
    tailles.push(t);
  }
  return tailles;
}
