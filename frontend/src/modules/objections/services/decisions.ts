import type {
  ObjectionCase,
  CommissionMember,
  VoteResult,
} from "../../../types";
export function disputed(c: ObjectionCase) {
  return c.issues.filter((i) => i.disputed);
}
export function overall(c: ObjectionCase) {
  const xs = disputed(c).map((i) => i.final || i.proposal);
  if (!xs.length || xs.some((x) => !x)) return "";
  return xs.every((x) => x === "accept")
    ? "accept"
    : xs.every((x) => x === "reject")
      ? "reject"
      : "partial";
}
export function remainingIssues(c: ObjectionCase) {
  return c.issues.filter(
    (i) => !i.disputed || (i.final || i.proposal) !== "accept",
  );
}
export function evaluateVotes(
  members: CommissionMember[],
  votes: Record<string, string>,
): VoteResult {
  const present = members.filter((m) => m.present);
  const chair =
    present.find((m) => m.id === "chair" && !m.recused) ||
    present.find((m) => m.id === "deputy" && !m.recused);
  if (members.length < 7)
    throw Error("В комиссии должно быть не менее 7 членов");
  if (present.length < Math.ceil(members.length / 2))
    throw Error("Нет кворума: необходимо не менее половины состава комиссии");
  if (!chair)
    throw Error(
      "Необходимо участие председателя либо замещающего его заместителя",
    );
  const eligible = present.filter((m) => !m.recused);
  for (const m of eligible)
    if (!["yes", "no"].includes(votes[m.id]))
      throw Error("Зафиксируйте голос каждого участвующего члена комиссии");
  const yes = eligible.filter((m) => votes[m.id] === "yes").length,
    no = eligible.length - yes;
  return {
    yes,
    no,
    approved:
      yes > present.length / 2 ||
      (yes === no && yes > 0 && votes[chair.id] === "yes"),
    chair: chair.id,
    present: present.length,
    eligible: eligible.length,
  };
}
