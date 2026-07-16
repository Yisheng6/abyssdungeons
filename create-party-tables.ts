import { getDb } from "../api/queries/connection";

const db = getDb();

async function createPartyTables() {
  console.log("Creating party tables...");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS parties (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      leader_id BIGINT UNSIGNED NOT NULL,
      leader_name VARCHAR(50) NOT NULL,
      status VARCHAR(20) DEFAULT 'recruiting' NOT NULL,
      dungeon_params JSON,
      max_members INT DEFAULT 4 NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_party_leader (leader_id),
      INDEX idx_party_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log("✅ parties table created");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS party_members (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      party_id BIGINT UNSIGNED NOT NULL,
      character_id BIGINT UNSIGNED NOT NULL,
      character_name VARCHAR(50) NOT NULL,
      class_id VARCHAR(20) NOT NULL,
      level INT DEFAULT 1 NOT NULL,
      is_ready TINYINT(1) DEFAULT 0,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pm_party (party_id),
      INDEX idx_pm_char (character_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log("✅ party_members table created");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS party_dungeon_runs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      party_id BIGINT UNSIGNED NOT NULL,
      leader_id BIGINT UNSIGNED NOT NULL,
      layer INT NOT NULL,
      x INT NOT NULL,
      y INT NOT NULL,
      seed VARCHAR(16) NOT NULL,
      status VARCHAR(20) DEFAULT 'active' NOT NULL,
      rooms_cleared INT DEFAULT 0,
      monsters_killed INT DEFAULT 0,
      loot_gained JSON,
      member_snapshot JSON,
      start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      end_time TIMESTAMP NULL,
      INDEX idx_pdr_party (party_id),
      INDEX idx_pdr_seed (seed)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log("✅ party_dungeon_runs table created");

  console.log("\nAll party tables created successfully!");
}

createPartyTables().catch(console.error);
