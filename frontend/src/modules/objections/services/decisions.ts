import type {
  ObjectionCase,
  CommissionMember,
  Outcome,
  VoteResult,
} from "../../../types";

const VICE_MINISTER_ID = "kenbeil-dm";
const DAVGA_DIRECTOR_ID = "kurenbek-shb";

/**
 * Председательствует вице-министр, а при его отсутствии — директор ДАВГА.
 * Признак isChair оставлен только для старых данных, где состав заседания
 * был сохранён до введения опроса о присутствии.
 */
export function presidingChairId(
  members: Pick<CommissionMember, "id" | "present" | "isChair">[],
) {
  return (
    members.find((member) => member.id === VICE_MINISTER_ID && member.present)
      ?.id ||
    members.find((member) => member.id === DAVGA_DIRECTOR_ID && member.present)
      ?.id ||
    members.find((member) => member.id === "chair" && member.present)?.id ||
    members.find((member) => member.isChair && member.present)?.id
  );
}

export function normalizeVoteChoice(value: string | undefined): Outcome | "" {
  if (value === "yes") return "accept";
  if (value === "no") return "reject";
  return ["accept", "partial", "reject", "refuse"].includes(value || "")
    ? (value as Outcome)
    : "";
}

export function pointOutcomeFromVotes(
  votes: Record<string, string>,
  chairId?: string,
): Outcome | "" {
  const choices = Object.values(votes).map(normalizeVoteChoice);
  if (!choices.length || choices.some((choice) => !choice)) return "";
  const totals = choices.reduce<Record<string, number>>((result, choice) => {
    result[choice] = (result[choice] || 0) + 1;
    return result;
  }, {});
  const highest = Math.max(...Object.values(totals));
  const leaders = Object.keys(totals).filter(
    (choice) => totals[choice] === highest,
  ) as Outcome[];

  // Результат определяется большинством голосов. При равенстве решающим
  // считается голос председательствующего на конкретном заседании.
  if (leaders.length === 1) return leaders[0];
  const chairChoice = chairId ? normalizeVoteChoice(votes[chairId]) : "";
  if (chairChoice && leaders.includes(chairChoice)) return chairChoice;

  // Старые тестовые записи не содержат сведений о председательствующем.
  // В таких данных нельзя выбрать произвольный голос, поэтому сохраняем
  // нейтральный результат «частично удовлетворить».
  return "partial";
}

export function disputed(c: ObjectionCase) {
  return c.issues.filter((i) => i.disputed);
}
export function overall(c: ObjectionCase) {
  const xs = disputed(c).map((point) => {
    const voteResult = c.votes?.[point.id];
    return (
      pointOutcomeFromVotes(voteResult?.votes || {}, voteResult?.chair) ||
      point.final ||
      point.proposal
    );
  });
  if (!xs.length || xs.some((x) => !x)) return "";
  if (xs.every((x) => x === xs[0])) return xs[0] || "";
  return xs.some((x) => x === "accept" || x === "partial")
    ? "partial"
    : "reject";
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
