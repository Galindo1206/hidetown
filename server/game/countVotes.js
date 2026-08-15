export function countVotes({ eligibleVoterIds, eligibleCandidateIds, votes }) {
  const voters = [...eligibleVoterIds];
  const candidates = [...eligibleCandidateIds];
  const voterSet = new Set(voters);
  const candidateSet = new Set(candidates);
  if (voterSet.size !== voters.length || candidateSet.size !== candidates.length || candidates.length < 2) {
    throw new TypeError("La ronda de votación no es válida.");
  }
  const entries = votes instanceof Map ? [...votes.entries()] : [...votes];
  const seenVoters = new Set();
  const totals = new Map(candidates.map((candidateId) => [candidateId, 0]));
  for (const [voterId, candidateId] of entries) {
    if (seenVoters.has(voterId) || !voterSet.has(voterId) || !candidateSet.has(candidateId) || voterId === candidateId) {
      throw new TypeError("La papeleta contiene un voto inválido.");
    }
    seenVoters.add(voterId);
    totals.set(candidateId, totals.get(candidateId) + 1);
  }
  const highestCount = Math.max(...totals.values());
  const topCandidateIds = candidates.filter((candidateId) => totals.get(candidateId) === highestCount);
  return {
    validVotes: entries.length,
    abstentions: voters.length - entries.length,
    totals,
    topCandidateIds,
    tied: topCandidateIds.length > 1,
    selectedCandidateId: topCandidateIds.length === 1 ? topCandidateIds[0] : null
  };
}
