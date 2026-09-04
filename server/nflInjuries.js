import { TEAMS } from '../src/data.js';

export function parseNflInjuries(payload) {
  // ESPN's `season` is metadata, not an iterable list of teams.
  const groups = Array.isArray(payload?.injuries) ? payload.injuries : [];
  return groups.flatMap((group) => {
    const rows = Array.isArray(group?.injuries) ? group.injuries : [];
    const abbr = group?.team?.abbreviation || rows.find((row) => row?.athlete?.team?.abbreviation)?.athlete.team.abbreviation || Object.keys(TEAMS).find((key) => TEAMS[key] === group?.displayName);
    if (!abbr || !TEAMS[abbr]) return [];
    const injuries = rows.slice(0, 8).map((injury) => ({
      name: injury?.athlete?.displayName || `${injury?.athlete?.firstName ?? ''} ${injury?.athlete?.lastName ?? ''}`.trim(),
      position: injury?.athlete?.position?.abbreviation || '',
      status: typeof injury?.status === 'string' ? injury.status : injury?.status?.name || '',
      type: typeof injury?.type === 'string' ? injury.type : injury?.type?.description || '',
      detail: injury?.longComment || injury?.shortComment || '',
    })).filter((injury) => injury.name && injury.status);
    return injuries.length ? [{ team: abbr, logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`, injuries }] : [];
  });
}
