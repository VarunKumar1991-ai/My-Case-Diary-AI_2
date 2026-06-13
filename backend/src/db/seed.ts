import { db, pool } from "./client.js";
import { caseDiaries, caseTypes, designations, users } from "./schema.js";
import { generateId } from "../shared/id.js";

/**
 * Dev/staging seed data only (§12 Phase 1). Idempotent — safe to re-run:
 * taxonomy rows are upserted by their unique `name`, users by their `id` (pno).
 *
 * "ADG (Technical)" must exist as both a designation AND the designation of an
 * ADMIN user — it is the literal identity check the private-access-approval
 * workflow relies on (architecture.md D14).
 */

const CASE_TYPES = [
  { name: "Vehicle Theft", description: "Theft of motor vehicles (IPC 379 / BNS 303)" },
  { name: "Kidnapping", description: "Kidnapping and abduction offences (IPC 363-369 / BNS 137-141)" },
  { name: "POCSO", description: "Offences under the Protection of Children from Sexual Offences Act, 2012" },
  { name: "SC/ST Act", description: "Offences under the Scheduled Castes and Scheduled Tribes (Prevention of Atrocities) Act, 1989" },
  { name: "Cyber Crime", description: "Offences under the IT Act, 2000 and related cyber-fraud provisions" },
  { name: "Murder", description: "Culpable homicide and murder (IPC 302 / BNS 103)" },
  { name: "Robbery / Dacoity", description: "Robbery and dacoity offences (IPC 392-402 / BNS 309-315)" },
  { name: "Narcotics (NDPS)", description: "Offences under the Narcotic Drugs and Psychotropic Substances Act, 1985" },
  { name: "Other", description: "Cases that do not fit an existing category" },
] as const;

const DESIGNATIONS = [
  { name: "Constable", description: "Constabulary rank" },
  { name: "Head Constable", description: "Senior constabulary rank" },
  { name: "Sub-Inspector", description: "Investigating-rank officer (SI)" },
  { name: "Inspector", description: "Station House Officer rank" },
  { name: "Circle Officer", description: "Supervisory rank over multiple police stations (CO)" },
  { name: "Additional Superintendent of Police", description: "Additional SP" },
  { name: "Superintendent of Police", description: "District-level command (SP)" },
  { name: "Senior Superintendent of Police", description: "District-level command, senior (SSP)" },
  { name: "Deputy Inspector General of Police", description: "Range-level command (DIG)" },
  { name: "Inspector General of Police", description: "Zone-level command (IG)" },
  { name: "Additional Director General of Police", description: "State-level command (ADG)" },
  { name: "ADG (Technical)", description: "ADG-Technical — sole approver of admin access requests to PRIVATE case diaries (§5.2)" },
  { name: "Director General of Police", description: "Head of the UP Police force (DGP)" },
] as const;

interface SeedUser {
  id: string; // pno
  name: string;
  designation: (typeof DESIGNATIONS)[number]["name"];
  email: string;
  mobile: string;
  role: "OFFICER" | "ADMIN";
}

const SEED_USERS: SeedUser[] = [
  { id: "UP00101", name: "Anil Kumar Sharma", designation: "Sub-Inspector", email: "anil.sharma@uppolice.gov.in", mobile: "+919810000101", role: "OFFICER" },
  { id: "UP00102", name: "Ravi Pratap Singh", designation: "Inspector", email: "ravi.singh@uppolice.gov.in", mobile: "+919810000102", role: "OFFICER" },
  { id: "UP00103", name: "Neha Verma", designation: "Sub-Inspector", email: "neha.verma@uppolice.gov.in", mobile: "+919810000103", role: "OFFICER" },
  { id: "UP00104", name: "Sanjay Yadav", designation: "Circle Officer", email: "sanjay.yadav@uppolice.gov.in", mobile: "+919810000104", role: "OFFICER" },
  { id: "UP00001", name: "Vikram Singh Rathore", designation: "Director General of Police", email: "dgp.office@uppolice.gov.in", mobile: "+919810000001", role: "ADMIN" },
  { id: "UP00002", name: "Meera Krishnan", designation: "ADG (Technical)", email: "adg.technical@uppolice.gov.in", mobile: "+919810000002", role: "ADMIN" },
];

const SAMPLE_DIARIES = [
  {
    ownerId: "UP00101",
    caseTypeName: "Vehicle Theft",
    caseDiaryNo: "CD-2026-0001",
    firNo: "FIR-2026-0042",
    underSection: "IPC 379 / BNS 303(2)",
    policeStation: "Hazratganj, Lucknow",
    incidentDateTime: new Date("2026-05-12T19:30:00+05:30"),
    firRegistrationDateTime: new Date("2026-05-12T21:10:00+05:30"),
    placeOfIncidence: "Parking area, Hazratganj Market, Lucknow",
    plaintiffName: "Rajesh Gupta",
    accusedName: "Unknown",
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Complainant reported that his motorcycle (UP32 AB 1234) was stolen from the market parking area between 19:00 and 19:30 hrs. CCTV footage from nearby shops is being collected.",
            },
          ],
        },
      ],
    },
    visibility: "PUBLIC" as const,
    status: "draft" as const,
  },
  {
    ownerId: "UP00102",
    caseTypeName: "Cyber Crime",
    caseDiaryNo: "CD-2026-0002",
    firNo: "FIR-2026-0058",
    underSection: "IT Act 66C/66D, BNS 318(4)",
    policeStation: "Gomti Nagar, Lucknow",
    incidentDateTime: new Date("2026-05-20T11:00:00+05:30"),
    firRegistrationDateTime: new Date("2026-05-21T10:15:00+05:30"),
    placeOfIncidence: "Online — victim's residence in Gomti Nagar, Lucknow",
    plaintiffName: "Sunita Agarwal",
    accusedName: "Unknown (online identity under investigation)",
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Complainant received a phishing call impersonating her bank and lost approx. Rs. 1,85,000 via UPI transfer. Bank statements and UPI transaction IDs requested from the payment provider for tracing.",
            },
          ],
        },
      ],
    },
    visibility: "PRIVATE" as const,
    status: "draft" as const,
  },
  {
    ownerId: "UP00103",
    caseTypeName: "Kidnapping",
    caseDiaryNo: "CD-2026-0003",
    firNo: "FIR-2026-0061",
    underSection: "IPC 363 / BNS 137",
    policeStation: "Alambagh, Lucknow",
    incidentDateTime: new Date("2026-05-25T08:45:00+05:30"),
    firRegistrationDateTime: new Date("2026-05-25T09:30:00+05:30"),
    placeOfIncidence: "Near Alambagh Bus Station, Lucknow",
    plaintiffName: "Ramesh Chandra",
    accusedName: "Suspected — under investigation",
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Minor reported missing on the way to school. Statements recorded from family members and school staff; search teams deployed at bus station and surrounding localities.",
            },
          ],
        },
      ],
    },
    visibility: "PRIVATE" as const,
    status: "finalized" as const,
  },
];

async function seedTaxonomies() {
  await db.insert(caseTypes).values(
    CASE_TYPES.map((c) => ({ id: generateId("case_type"), name: c.name, description: c.description })),
  ).onConflictDoNothing({ target: caseTypes.name });

  await db.insert(designations).values(
    DESIGNATIONS.map((d) => ({ id: generateId("designation"), name: d.name, description: d.description })),
  ).onConflictDoNothing({ target: designations.name });

  console.log(`Seeded ${CASE_TYPES.length} case types and ${DESIGNATIONS.length} designations (idempotent).`);
}

async function seedUsers() {
  await db.insert(users).values(
    SEED_USERS.map((u) => ({
      id: u.id,
      name: u.name,
      designation: u.designation,
      email: u.email,
      mobile: u.mobile,
      role: u.role,
      accountStatus: "ACTIVE" as const,
    })),
  ).onConflictDoNothing({ target: users.id });

  console.log(`Seeded ${SEED_USERS.length} users (idempotent). Sign in via OTP using any seeded email/mobile.`);
}

async function seedCaseDiaries() {
  const caseTypeRows = await db.select({ id: caseTypes.id, name: caseTypes.name }).from(caseTypes);
  const caseTypeIdByName = new Map(caseTypeRows.map((row) => [row.name, row.id]));

  let inserted = 0;
  for (const diary of SAMPLE_DIARIES) {
    const caseTypeId = caseTypeIdByName.get(diary.caseTypeName);
    if (!caseTypeId) continue;

    const result = await db
      .insert(caseDiaries)
      .values({
        id: generateId("diary"),
        ownerId: diary.ownerId,
        caseTypeId,
        caseDiaryNo: diary.caseDiaryNo,
        firNo: diary.firNo,
        underSection: diary.underSection,
        policeStation: diary.policeStation,
        incidentDateTime: diary.incidentDateTime,
        firRegistrationDateTime: diary.firRegistrationDateTime,
        placeOfIncidence: diary.placeOfIncidence,
        plaintiffName: diary.plaintiffName,
        accusedName: diary.accusedName,
        body: diary.body,
        visibility: diary.visibility,
        status: diary.status,
      })
      .onConflictDoNothing({ target: [caseDiaries.ownerId, caseDiaries.caseDiaryNo] })
      .returning({ id: caseDiaries.id });

    if (result.length > 0) inserted += 1;
  }

  console.log(`Seeded ${inserted} sample case diaries (idempotent).`);
}

async function main() {
  await seedTaxonomies();
  await seedUsers();
  await seedCaseDiaries();
  await pool.end();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exitCode = 1;
});
