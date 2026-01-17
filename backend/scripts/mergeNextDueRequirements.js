const sql = require("mssql");
const crypto = require("crypto");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const config = {
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_NAME,
  options: { encrypt: true, enableArithAbort: true },
};

function baseNameForNextDue(name) {
  return String(name)
    .replace(/\s+next due\s*:?.*$/i, "")
    .replace(/\s+next due\s*\([^)]*\)\s*:?.*$/i, "")
    .replace(/\s+$/, "")
    .replace(/:\s*$/, "")
    .trim();
}

function maxNumber(left, right) {
  const l = Number.isFinite(Number(left)) ? Number(left) : 0;
  const r = Number.isFinite(Number(right)) ? Number(right) : 0;
  return Math.max(l, r);
}

async function mergeRequirement(pool, baseRequirement, nextRequirement) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    request.input("baseId", sql.UniqueIdentifier, baseRequirement.id);
    request.input("nextId", sql.UniqueIdentifier, nextRequirement.id);

    const baseAssignments = await request.query(
      "SELECT id, personId FROM assignment WHERE requirementId = @baseId",
    );
    const baseByPerson = new Map(
      baseAssignments.recordset.map((row) => [row.personId, row.id]),
    );

    const nextAssignments = await request.query(
      "SELECT id, personId FROM assignment WHERE requirementId = @nextId",
    );

    for (const assignment of nextAssignments.recordset) {
      const baseAssignmentId = baseByPerson.get(assignment.personId);
      if (baseAssignmentId) {
        const evidenceUpdate = new sql.Request(transaction);
        evidenceUpdate
          .input("fromId", sql.UniqueIdentifier, assignment.id)
          .input("toId", sql.UniqueIdentifier, baseAssignmentId);
        await evidenceUpdate.query(
          "UPDATE evidence SET assignmentId = @toId WHERE assignmentId = @fromId",
        );

        const deleteAssignment = new sql.Request(transaction);
        deleteAssignment.input("assignmentId", sql.UniqueIdentifier, assignment.id);
        await deleteAssignment.query("DELETE FROM assignment WHERE id = @assignmentId");
      } else {
        const updateAssignment = new sql.Request(transaction);
        updateAssignment
          .input("assignmentId", sql.UniqueIdentifier, assignment.id)
          .input("baseId", sql.UniqueIdentifier, baseRequirement.id);
        await updateAssignment.query(
          "UPDATE assignment SET requirementId = @baseId WHERE id = @assignmentId",
        );
      }
    }

    const nextRoleLinks = await request.query(
      "SELECT roleId FROM training_requirement_roles_role WHERE trainingRequirementId = @nextId",
    );
    for (const link of nextRoleLinks.recordset) {
      const check = new sql.Request(transaction);
      check
        .input("baseId", sql.UniqueIdentifier, baseRequirement.id)
        .input("roleId", sql.UniqueIdentifier, link.roleId);
      const existing = await check.query(
        "SELECT 1 AS present FROM training_requirement_roles_role WHERE trainingRequirementId = @baseId AND roleId = @roleId",
      );
      if (!existing.recordset.length) {
        const insertLink = new sql.Request(transaction);
        insertLink
          .input("baseId", sql.UniqueIdentifier, baseRequirement.id)
          .input("roleId", sql.UniqueIdentifier, link.roleId);
        await insertLink.query(
          "INSERT INTO training_requirement_roles_role (trainingRequirementId, roleId) VALUES (@baseId, @roleId)",
        );
      }
    }

    const deleteRoleLinks = new sql.Request(transaction);
    deleteRoleLinks.input("nextId", sql.UniqueIdentifier, nextRequirement.id);
    await deleteRoleLinks.query(
      "DELETE FROM training_requirement_roles_role WHERE trainingRequirementId = @nextId",
    );

    const nextGroupLinks = await request.query(
      "SELECT roleId, requiredLevel FROM training_requirement_group WHERE requirementId = @nextId",
    );
    for (const link of nextGroupLinks.recordset) {
      const check = new sql.Request(transaction);
      check
        .input("baseId", sql.UniqueIdentifier, baseRequirement.id)
        .input("roleId", sql.UniqueIdentifier, link.roleId);
      const existing = await check.query(
        "SELECT requiredLevel FROM training_requirement_group WHERE requirementId = @baseId AND roleId = @roleId",
      );
      if (!existing.recordset.length) {
        const insertGroup = new sql.Request(transaction);
        insertGroup
          .input("id", sql.UniqueIdentifier, crypto.randomUUID())
          .input("baseId", sql.UniqueIdentifier, baseRequirement.id)
          .input("roleId", sql.UniqueIdentifier, link.roleId)
          .input("requiredLevel", sql.Int, link.requiredLevel ?? 0);
        await insertGroup.query(
          "INSERT INTO training_requirement_group (id, requirementId, roleId, requiredLevel, createdAt, updatedAt) VALUES (@id, @baseId, @roleId, @requiredLevel, GETUTCDATE(), GETUTCDATE())",
        );
      } else {
        const existingRow = existing.recordset[0];
        const updateGroup = new sql.Request(transaction);
        updateGroup
          .input("baseId", sql.UniqueIdentifier, baseRequirement.id)
          .input("roleId", sql.UniqueIdentifier, link.roleId)
          .input("requiredLevel", sql.Int, maxNumber(existingRow.requiredLevel, link.requiredLevel));
        await updateGroup.query(
          "UPDATE training_requirement_group SET requiredLevel = @requiredLevel, updatedAt = GETUTCDATE() WHERE requirementId = @baseId AND roleId = @roleId",
        );
      }
    }

    const deleteGroupLinks = new sql.Request(transaction);
    deleteGroupLinks.input("nextId", sql.UniqueIdentifier, nextRequirement.id);
    await deleteGroupLinks.query(
      "DELETE FROM training_requirement_group WHERE requirementId = @nextId",
    );

    const updateBase = new sql.Request(transaction);
    updateBase
      .input("baseId", sql.UniqueIdentifier, baseRequirement.id)
      .input(
        "validityPeriodMonths",
        sql.Int,
        maxNumber(baseRequirement.validityPeriodMonths, nextRequirement.validityPeriodMonths),
      )
      .input(
        "requiredLevel",
        sql.Int,
        maxNumber(baseRequirement.requiredLevel, nextRequirement.requiredLevel),
      )
      .input("category", sql.NVarChar, baseRequirement.category ?? nextRequirement.category ?? null)
      .input(
        "importanceLevel",
        sql.Int,
        maxNumber(baseRequirement.importanceLevel, nextRequirement.importanceLevel),
      )
      .input(
        "minimumAttendees",
        sql.Int,
        maxNumber(baseRequirement.minimumAttendees, nextRequirement.minimumAttendees),
      )
      .input("enabled", sql.Bit, baseRequirement.enabled || nextRequirement.enabled ? 1 : 0);
    await updateBase.query(
      `UPDATE training_requirement
       SET validityPeriodMonths = @validityPeriodMonths,
           requiredLevel = @requiredLevel,
           category = @category,
           importanceLevel = @importanceLevel,
           minimumAttendees = @minimumAttendees,
           enabled = @enabled,
           updatedAt = GETUTCDATE()
       WHERE id = @baseId`,
    );

    const deleteRequirement = new sql.Request(transaction);
    deleteRequirement.input("nextId", sql.UniqueIdentifier, nextRequirement.id);
    await deleteRequirement.query("DELETE FROM training_requirement WHERE id = @nextId");

    await transaction.commit();
    return { merged: true };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rename = process.argv.includes("--rename");
  if (apply && rename) {
    throw new Error("Choose either --apply or --rename, not both.");
  }
  const pool = await sql.connect(config);
  const requirementsResult = await pool.request().query(
    "SELECT id, name, validityPeriodMonths, requiredLevel, category, importanceLevel, minimumAttendees, enabled FROM training_requirement",
  );

  const requirements = requirementsResult.recordset;
  const byName = new Map(requirements.map((row) => [row.name.toLowerCase(), row]));
  const nextDue = requirements.filter((row) => /next due/i.test(row.name));

  const merges = [];
  const skipped = [];

  for (const next of nextDue) {
    const baseName = baseNameForNextDue(next.name);
    const base = byName.get(baseName.toLowerCase());
    if (!base) {
      skipped.push({ nextDue: next.name, reason: "Base course not found", baseName });
      continue;
    }
    if (base.id === next.id) {
      continue;
    }
    merges.push({ base, next });
  }

  console.log(`Found ${merges.length} merge candidates, ${skipped.length} skipped.`);
  if (skipped.length) {
    console.log("Skipped:");
    console.log(JSON.stringify(skipped, null, 2));
  }

  if (!apply && !rename) {
    console.log("Dry run only. Re-run with --apply to perform merges or --rename to rename Next Due titles.");
    await pool.close();
    return;
  }

  if (rename) {
    for (const { base, next } of merges) {
      console.log(`Skipping rename for '${next.name}' because base '${base.name}' exists.`);
    }
    for (const entry of skipped) {
      if (!entry.baseName) continue;
      console.log(`Renaming '${entry.nextDue}' -> '${entry.baseName}'`);
      const update = new sql.Request(pool);
      update.input("id", sql.UniqueIdentifier, requirements.find((row) => row.name === entry.nextDue)?.id);
      update.input("name", sql.NVarChar, entry.baseName);
      await update.query("UPDATE training_requirement SET name = @name, updatedAt = GETUTCDATE() WHERE id = @id");
    }
    await pool.close();
    console.log("Rename completed.");
    return;
  }

  for (const { base, next } of merges) {
    console.log(`Merging '${next.name}' into '${base.name}'...`);
    await mergeRequirement(pool, base, next);
  }

  await pool.close();
  console.log("Merge completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
