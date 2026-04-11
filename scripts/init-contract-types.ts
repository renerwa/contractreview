import { db } from '@/core/db';
import { envConfigs } from '@/config';
import { getUuid } from '@/shared/lib/hash';

async function loadSchemaTables(): Promise<any> {
  if (envConfigs.database_provider === 'mysql') {
    return (await import('@/config/db/schema.mysql')) as any;
  }

  if (['sqlite', 'turso', 'd1'].includes(envConfigs.database_provider)) {
    return (await import('@/config/db/schema.sqlite')) as any;
  }

  return (await import('@/config/db/schema')) as any;
}

const contractTypeSeedSource = String.raw`英文标准名 (含缩写备注)	中文解释	使用场景
NDA (Non-Disclosure Agreement)	保密协议	合作伙伴初次洽谈、项目调研、核心技术展示、融资初步沟通。
MSA (Master Service Agreement)	主服务框架协议	与供应商建立长期合作、为多项子服务制定统一的法律与财务基准。
SOW (Statement of Work)	工作说明书	挂载在 MSA 之下，定义具体项目的交付细节、任务清单与验收标准。
Sales & Purchase Agreement	销售与采购协议	涉及实体货物或标准化产品的买卖、进出口贸易、批量采购。
DPA (Data Processing Agreement)	数据处理协议	涉及用户个人隐私数据流动、符合 GDPR（欧盟）或 CCPA（美国）合规要求。
Employment Agreement	雇佣合同	招聘全职员工，涉及底薪、奖金、休假、解雇通知期等法定义务。
Independent Contractor Agreement	独立承包人协议	雇佣外部顾问、自由职业者、外包团队，明确非雇佣关系及 IP 归属。
SHA (Shareholders' Agreement)	股东协议	规范公司股东之间的权利、董事会构成、重大事项否决权及退出机制。
ESOP / Stock Option Agreement	员工期权协议	初创公司激励核心人才、设定股权归属（Vesting）与行权条件。
Commercial Lease Agreement	商业租赁合同	租赁办公室、厂房、仓库或零售店面，涉及免租期、修缮与转租。
SaaS Agreement (Software as a Service)	软件即服务协议	销售云端软件订阅服务，涉及系统可用性（SLA）、数据所有权与续约。
SAFE (Simple Agreement for Future Equity)	未来股权简单协议	早期初创公司进行种子轮融资、硅谷最常用的标准化融资工具。
IP Assignment Agreement	知识产权转让协议	将专利、商标、软件代码或创意设计的全球所有权永久转让给买方。
Distribution Agreement	分销协议	品牌方授权代理商或经销商在特定国家/地区销售产品。
LOI / Term Sheet (Letter of Intent)	意向书 / 条款清单	记录大型并购、融资或战略合作前的初步共识，锁定排他谈判期。
ToS & Privacy Policy (Terms of Service)	服务条款与隐私政策	网站、App 或在线平台上线必选，定义用户行为规范与数据收集声明。`;

const contractTypeSeedRows = [
  [
    'NDA',
    'NDA (Non-Disclosure Agreement)',
    '保密协议',
    '合作伙伴初次洽谈、项目调研、核心技术展示、融资初步沟通。',
  ],
  [
    'MSA',
    'MSA (Master Service Agreement)',
    '主服务框架协议',
    '与供应商建立长期合作、为多项子服务制定统一的法律与财务基准。',
  ],
  [
    'SOW',
    'SOW (Statement of Work)',
    '工作说明书',
    '挂载在 MSA 之下，定义具体项目的交付细节、任务清单与验收标准。',
  ],
  [
    'Sales & Purchase Agreement',
    'Sales & Purchase Agreement',
    '销售与采购协议',
    '涉及实体货物或标准化产品的买卖、进出口贸易、批量采购。',
  ],
  [
    'DPA',
    'DPA (Data Processing Agreement)',
    '数据处理协议',
    '涉及用户个人隐私数据流动、符合 GDPR（欧盟）或 CCPA（美国）合规要求。',
  ],
  [
    'Employment Agreement',
    'Employment Agreement',
    '雇佣合同',
    '招聘全职员工，涉及底薪、奖金、休假、解雇通知期等法定义务。',
  ],
  [
    'Independent Contractor Agreement',
    'Independent Contractor Agreement',
    '独立承包人协议',
    '雇佣外部顾问、自由职业者、外包团队，明确非雇佣关系及 IP 归属。',
  ],
  [
    'SHA',
    "SHA (Shareholders' Agreement)",
    '股东协议',
    '规范公司股东之间的权利、董事会构成、重大事项否决权及退出机制。',
  ],
  [
    'ESOP',
    'ESOP / Stock Option Agreement',
    '员工期权协议',
    '初创公司激励核心人才、设定股权归属（Vesting）与行权条件。',
  ],
  [
    'Commercial Lease Agreement',
    'Commercial Lease Agreement',
    '商业租赁合同',
    '租赁办公室、厂房、仓库或零售店面，涉及免租期、修缮与转租。',
  ],
  [
    'SaaS',
    'SaaS Agreement (Software as a Service)',
    '软件即服务协议',
    '销售云端软件订阅服务，涉及系统可用性（SLA）、数据所有权与续约。',
  ],
  [
    'SAFE',
    'SAFE (Simple Agreement for Future Equity)',
    '未来股权简单协议',
    '早期初创公司进行种子轮融资、硅谷最常用的标准化融资工具。',
  ],
  [
    'IP Assignment Agreement',
    'IP Assignment Agreement',
    '知识产权转让协议',
    '将专利、商标、软件代码或创意设计的全球所有权永久转让给买方。',
  ],
  [
    'Distribution Agreement',
    'Distribution Agreement',
    '分销协议',
    '品牌方授权代理商或经销商在特定国家/地区销售产品。',
  ],
  [
    'LOI',
    'LOI / Term Sheet (Letter of Intent)',
    '意向书 / 条款清单',
    '记录大型并购、融资或战略合作前的初步共识，锁定排他谈判期。',
  ],
  [
    'ToS',
    'ToS & Privacy Policy (Terms of Service)',
    '服务条款与隐私政策',
    '网站、App 或在线平台上线必选，定义用户行为规范与数据收集声明。',
  ],
] as const;

async function initContractTypes() {
  const { contractType } = (await loadSchemaTables()) as any;

  const results: any[] = [];
  for (let i = 0; i < contractTypeSeedRows.length; i += 1) {
    const [code, nameEn, nameZh, usageScene] = contractTypeSeedRows[i];
    const [row] = await db()
      .insert(contractType)
      .values({
        id: getUuid(),
        code,
        nameZh,
        nameEn,
        usageScene,
        description: null,
        sort: i,
        isActive: true,
        metadata: null,
      })
      .onConflictDoUpdate({
        target: contractType.code,
        set: {
          nameZh,
          nameEn,
          usageScene,
          description: null,
          sort: i,
          isActive: true,
          metadata: null,
        },
      })
      .returning();
    if (row) results.push(row);
  }

  console.log(`contract_types initialized: ${results.length}`);
}

initContractTypes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
