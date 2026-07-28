export function buildOnboardingKnowledgeText(params: {
  nombre: string;
  services: { nombre: string; duracion_minutos: number; precio?: string }[];
  horarios: string;
  faq: string;
  aliasCbu?: string;
  instruccionesSena?: string;
}): string {
  const lines: string[] = [
    `Base de conocimiento — ${params.nombre}`,
    "",
    "## Servicios",
  ];

  for (const s of params.services) {
    lines.push(
      `- ${s.nombre}: duración ${s.duracion_minutos} minutos${
        s.precio ? `, precio ${s.precio}` : ""
      }`
    );
  }

  lines.push("", "## Horarios de atención", params.horarios || "Consultar.");

  if (params.faq) {
    lines.push("", "## FAQ / información general", params.faq);
  }

  if (params.aliasCbu || params.instruccionesSena) {
    lines.push("", "## Seña / pago");
    if (params.instruccionesSena) lines.push(params.instruccionesSena);
    if (params.aliasCbu) lines.push(`Alias o CBU: ${params.aliasCbu}`);
  }

  lines.push(
    "",
    "## Notas",
    "La información fue cargada por el negocio vía formulario de onboarding."
  );

  return lines.join("\n");
}
