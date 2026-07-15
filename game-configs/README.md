# 游戏配置目录规范

## 目录结构

```
game-configs/
├── references.json      # 统一引用定义中心（枚举值、命名规则）
├── global.json          # 全局通用配置（数值常量、系统开关、文案模板）
├── classes.json         # 职业配置
├── skills.json          # 技能配置
├── items.json           # 装备与道具配置
├── monsters.json        # 怪物与 AI 配置
├── dungeons.json        # 地牢与地图生成配置
├── quests/              # [预留] 任务配置
├── shops/               # [预留] 商店配置
├── achievements/        # [预留] 成就配置
└── buffs/               # [预留] Buff/Debuff 配置
```

## 设计原则

### 1. references.json 是唯一真理源

所有跨表引用的 ID 枚举值必须在 `references.json` 的 `enums` 中定义。

**例如：** 职业 ID `warrior` 在 `references.json` 中定义为合法枚举值，
`skills.json` 中的 `classId` 字段只能引用该枚举集合中的值。

**好处：** 修改职业 ID 时，只需改 `references.json` 一处，
校验脚本会自动检测所有引用处是否需要同步更新。

### 2. global.json 统管全局数值

所有影响游戏平衡的数值常量必须放在 `global.json` 中，
禁止在代码中硬编码游戏数值。

**包括但不限于：**
- 等级上限、经验曲线
- 战斗公式参数（暴击倍率、闪避上限）
- 系统开关（PVP 开关、功能解锁等级）
- 文案模板（死亡提示、升级提示）

### 3. 静态配置 vs 动态数据严格分层

| 数据类型 | 存储位置 | 说明 |
|---------|---------|------|
| 职业/技能/怪物模板 | `game-configs/*.json` | 静态配置，只读 |
| 全局数值常量 | `game-configs/global.json` | 静态配置，只读 |
| 玩家角色数据 | MySQL `characters` 表 | 动态数据，读写 |
| 玩家背包 | MySQL `inventory` 表 | 动态数据，读写 |
| 副本进度 | Redis `session:{id}` | 运行时状态，TTL |
| 排行榜 | Redis Sorted Set | 运行时数据 |
| 聊天记录 | Redis List | 运行时数据，TTL |

**禁止：** 将玩家数据、战斗状态、副本进度等动态数据写入 JSON 文件。

### 4. 新增模块扩展规范

新增游戏系统（如宠物、公会、任务）时：

1. 在 `references.json` 的 `enums` 中定义新枚举值
2. 在 `game-configs/` 下新建 JSON 文件（或在子目录中）
3. 在 `contracts/schemas.ts` 中定义 Zod Schema
4. 在 `scripts/validate-configs.ts` 中添加校验规则
5. 在 `api/services/config-service.ts` 中添加加载函数

### 5. 修改配置的工作流

```
1. 修改 JSON 配表文件
2. 运行 npm run validate-configs
3. 修复所有校验错误
4. 运行 npm run build
5. 部署到服务器
6. 服务器重启后配置自动热加载
```
