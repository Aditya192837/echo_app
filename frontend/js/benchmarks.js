/**
 * benchmarks.js - Data & comparative analytics from Barrios et al.,
 * Nature Cardiovascular Research 2026:
 * "Multiview deep learning improves detection of major cardiac conditions from echocardiography"
 * (DOI: 10.1038/s44161-026-00786-7)
 */

export const PAPER_TASKS = {
  lvrv: {
    id: 'lvrv',
    name: 'LV/RV Abnormality (Composite)',
    description: 'Primary composite task detecting any abnormality in left or right ventricular size or systolic function (N=6,279).',
    cohortSize: 'N = 6,279 (UCSF Test Dataset)',
    multiviewGain: '+0.056 AUC over best single-view (P < 0.001)',
    models: [
      { name: 'Multiview (A2c, A4c, PLAX)', type: 'multiview', auc: 0.907, ci: '0.900–0.914', sens: 0.810, spec: 0.840, ppv: 0.609, npv: 0.935, f1: 0.695, highlight: true },
      { name: 'Late Fusion (Average of 3)', type: 'fusion', auc: 0.889, ci: '0.880–0.898', sens: 0.780, spec: 0.840, ppv: 0.599, npv: 0.925, f1: 0.671 },
      { name: 'Single-View A4c', type: 'single', auc: 0.851, ci: '0.841–0.861', sens: 0.736, spec: 0.791, ppv: 0.520, npv: 0.907, f1: 0.609 },
      { name: 'Single-View PLAX', type: 'single', auc: 0.848, ci: '0.838–0.857', sens: 0.763, spec: 0.768, ppv: 0.503, npv: 0.913, f1: 0.606 },
      { name: 'Single-View A2c', type: 'single', auc: 0.783, ci: '0.771–0.795', sens: 0.642, spec: 0.772, ppv: 0.464, npv: 0.875, f1: 0.539 }
    ]
  },
  diastolic: {
    id: 'diastolic',
    name: 'Diastolic Dysfunction (Novel B-Mode)',
    description: 'Novel AI-enabled task identifying diastolic dysfunction grades 1–4 from non-Doppler B-mode echo videos alone (N=2,263).',
    cohortSize: 'N = 2,263 (UCSF Test Dataset)',
    multiviewGain: '+0.087 AUC over best single-view (P < 0.001)',
    models: [
      { name: 'Multiview (A2c, A4c, PLAX)', type: 'multiview', auc: 0.836, ci: '0.821–0.851', sens: 0.736, spec: 0.774, ppv: 0.878, npv: 0.570, f1: 0.801, highlight: true },
      { name: 'Late Fusion (Average of 3)', type: 'fusion', auc: 0.783, ci: '0.771–0.794', sens: 0.675, spec: 0.774, ppv: 0.902, npv: 0.438, f1: 0.773 },
      { name: 'Single-View PLAX', type: 'single', auc: 0.749, ci: '0.730–0.767', sens: 0.777, spec: 0.596, ppv: 0.811, npv: 0.546, f1: 0.794 },
      { name: 'Single-View A4c', type: 'single', auc: 0.708, ci: '0.688–0.727', sens: 0.712, spec: 0.596, ppv: 0.797, npv: 0.482, f1: 0.752 },
      { name: 'Single-View A2c', type: 'single', auc: 0.646, ci: '0.625–0.667', sens: 0.650, spec: 0.579, ppv: 0.775, npv: 0.426, f1: 0.707 }
    ]
  },
  valve: {
    id: 'valve',
    name: 'Substantial Valve Regurgitation',
    description: 'Composite task detecting moderate or greater regurgitation across mitral, aortic, or tricuspid valves with Color Doppler (N=4,148).',
    cohortSize: 'N = 4,148 (UCSF Test Dataset)',
    multiviewGain: '+0.068 AUC over best single-view (P = 0.02 vs late fusion)',
    models: [
      { name: 'Multiview (A5c, A4c, PLAX)', type: 'multiview', auc: 0.904, ci: '0.892–0.915', sens: 0.826, spec: 0.829, ppv: 0.395, npv: 0.972, f1: 0.534, highlight: true },
      { name: 'Late Fusion (Average of 3)', type: 'fusion', auc: 0.891, ci: '0.879–0.903', sens: 0.791, spec: 0.829, ppv: 0.385, npv: 0.967, f1: 0.518 },
      { name: 'Single-View A4c', type: 'single', auc: 0.836, ci: '0.821–0.852', sens: 0.769, spec: 0.750, ppv: 0.294, npv: 0.960, f1: 0.426 },
      { name: 'Single-View PLAX', type: 'single', auc: 0.823, ci: '0.806–0.839', sens: 0.702, spec: 0.790, ppv: 0.311, npv: 0.952, f1: 0.431 },
      { name: 'Single-View A5c', type: 'single', auc: 0.816, ci: '0.799–0.831', sens: 0.763, spec: 0.716, ppv: 0.267, npv: 0.957, f1: 0.395 }
    ]
  },
  lvef: {
    id: 'lvef',
    name: 'Component: LVEF < 50%',
    description: 'Direct assessment of reduced left ventricular ejection fraction by Simpson biplane criteria (N=6,256).',
    cohortSize: 'N = 6,256 (UCSF Test Dataset)',
    multiviewGain: '+0.042 AUC over single-view A4c',
    models: [
      { name: 'Multiview (A2c, A4c, PLAX)', type: 'multiview', auc: 0.942, ci: '0.935–0.948', sens: 0.823, spec: 0.906, ppv: 0.616, npv: 0.966, f1: 0.704, highlight: true },
      { name: 'Single-View A4c', type: 'single', auc: 0.900, ci: '0.891–0.909', sens: 0.840, spec: 0.791, ppv: 0.423, npv: 0.964, f1: 0.563 },
      { name: 'Single-View PLAX', type: 'single', auc: 0.898, ci: '0.888–0.907', sens: 0.776, spec: 0.851, ppv: 0.488, npv: 0.954, f1: 0.599 },
      { name: 'Single-View A2c', type: 'single', auc: 0.879, ci: '0.869–0.888', sens: 0.807, spec: 0.783, ppv: 0.405, npv: 0.957, f1: 0.539 }
    ]
  },
  lv_size: {
    id: 'lv_size',
    name: 'Component: LV Dilation (Size Abnormality)',
    description: 'Left ventricular end diastolic volume index >86 ml/m² (men) or >70 ml/m² (women) (N=6,256).',
    cohortSize: 'N = 6,256 (UCSF Test Dataset)',
    multiviewGain: '+0.043 AUC over single-view PLAX',
    models: [
      { name: 'Multiview (A2c, A4c, PLAX)', type: 'multiview', auc: 0.902, ci: '0.890–0.914', sens: 0.819, spec: 0.820, ppv: 0.257, npv: 0.984, f1: 0.392, highlight: true },
      { name: 'Single-View PLAX', type: 'single', auc: 0.859, ci: '0.843–0.874', sens: 0.733, spec: 0.811, ppv: 0.228, npv: 0.976, f1: 0.348 },
      { name: 'Single-View A4c', type: 'single', auc: 0.843, ci: '0.827–0.858', sens: 0.753, spec: 0.767, ppv: 0.197, npv: 0.976, f1: 0.313 },
      { name: 'Single-View A2c', type: 'single', auc: 0.826, ci: '0.809–0.843', sens: 0.670, spec: 0.812, ppv: 0.213, npv: 0.970, f1: 0.323 }
    ]
  },
  rv_func: {
    id: 'rv_func',
    name: 'Component: RV Function Impairment',
    description: 'Moderately decreased or greater right ventricular function (N=6,256).',
    cohortSize: 'N = 6,256 (UCSF Test Dataset)',
    multiviewGain: '+0.035 AUC over single-view A4c',
    models: [
      { name: 'Multiview (A2c, A4c, PLAX)', type: 'multiview', auc: 0.931, ci: '0.920–0.940', sens: 0.906, spec: 0.821, ppv: 0.219, npv: 0.994, f1: 0.353, highlight: true },
      { name: 'Single-View A4c', type: 'single', auc: 0.896, ci: '0.883–0.907', sens: 0.872, spec: 0.733, ppv: 0.154, npv: 0.990, f1: 0.261 },
      { name: 'Single-View PLAX', type: 'single', auc: 0.881, ci: '0.865–0.894', sens: 0.802, spec: 0.811, ppv: 0.191, npv: 0.987, f1: 0.308 },
      { name: 'Single-View A2c', type: 'single', auc: 0.814, ci: '0.796–0.832', sens: 0.778, spec: 0.703, ppv: 0.127, npv: 0.983, f1: 0.218 }
    ]
  },
  mitral_regurg: {
    id: 'mitral_regurg',
    name: 'Component: Mitral Regurgitation',
    description: 'Moderate or severe mitral valve regurgitation by ASE guideline criteria (N=4,148).',
    cohortSize: 'N = 4,148 (UCSF Test Dataset)',
    multiviewGain: '+0.030 AUC over single-view PLAX',
    models: [
      { name: 'Multiview (A5c, A4c, PLAX)', type: 'multiview', auc: 0.930, ci: '0.915–0.943', sens: 0.842, spec: 0.866, ppv: 0.268, npv: 0.990, f1: 0.407, highlight: true },
      { name: 'Single-View PLAX', type: 'single', auc: 0.900, ci: '0.884–0.915', sens: 0.829, spec: 0.806, ppv: 0.199, npv: 0.988, f1: 0.321 },
      { name: 'Single-View A5c', type: 'single', auc: 0.868, ci: '0.849–0.887', sens: 0.794, spec: 0.767, ppv: 0.165, npv: 0.985, f1: 0.274 },
      { name: 'Single-View A4c', type: 'single', auc: 0.858, ci: '0.837–0.876', sens: 0.768, spec: 0.771, ppv: 0.163, npv: 0.983, f1: 0.269 }
    ]
  }
};

export const EXTERNAL_VALIDATION_MHI = {
  institution: 'Montreal Heart Institute (MHI), Montreal, Canada',
  details: 'External test dataset acquired in 2022 from an independent academic healthcare institution using linear measurement guidelines.',
  tasks: [
    {
      task: 'LV/RV Abnormality (Composite)',
      n: 1650,
      multiviewAuc: '0.909 (0.896–0.922)',
      ucsfAuc: '0.907 (0.900–0.914)',
      sens: '83.7%',
      spec: '79.9%',
      ppv: '61.4%',
      npv: '92.8%',
      f1: '0.708',
      status: 'Preserved Generalization (Overlapping 95% CI)'
    },
    {
      task: 'Valve Regurgitation (Composite)',
      n: 303,
      multiviewAuc: '0.924 (0.890–0.954)',
      ucsfAuc: '0.904 (0.892–0.915)',
      sens: '75.0%',
      spec: '88.6%',
      ppv: '50.0%',
      npv: '95.9%',
      f1: '0.600',
      status: 'Excellent Generalization'
    },
    {
      task: 'Diastolic Dysfunction (Composite)',
      n: 766,
      multiviewAuc: '0.791 (0.765–0.817)',
      ucsfAuc: '0.836 (0.821–0.851)',
      sens: '50.2%',
      spec: '85.2%',
      ppv: '69.4%',
      npv: '71.9%',
      f1: '0.582',
      status: 'Moderate Generalization (lower prevalence at MHI)'
    }
  ]
};

export const SUBGROUP_ROBUSTNESS = {
  demographics: [
    { group: 'Males', n: 3002, auc: 0.904, ci: '0.894–0.914', sens: '82.6%', spec: '81.0%', f1: 0.725 },
    { group: 'Females', n: 3241, auc: 0.907, ci: '0.894–0.918', sens: '79.0%', spec: '86.4%', f1: 0.655 },
    { group: 'Age 18–60', n: 2550, auc: 0.912, ci: '0.900–0.922', sens: '83.4%', spec: '84.0%', f1: 0.723 },
    { group: 'Age 61+', n: 3695, auc: 0.905, ci: '0.895–0.915', sens: '79.5%', spec: '84.0%', f1: 0.676 }
  ],
  manufacturers: [
    { vendor: 'Philips Healthcare', n: 4720, auc: 0.906, ci: '0.898–0.915', sens: '80.1%', spec: '85.3%', f1: 0.706 },
    { vendor: 'GE Healthcare', n: 1022, auc: 0.913, ci: '0.896–0.931', sens: '81.0%', spec: '84.5%', f1: 0.688 },
    { vendor: 'Siemens Acuson', n: 508, auc: 0.913, ci: '0.888–0.938', sens: '74.3%', spec: '90.1%', f1: 0.700 }
  ]
};

export const OPERATING_PRESETS = [
  {
    id: 'f1',
    name: 'F1-Optimal (Validation-Tuned)',
    threshold: 0.0974,
    description: 'Balances sensitivity and specificity for general clinical triage. Minimises missed cases while preserving acceptable specificity.'
  },
  {
    id: 'high_sens',
    name: 'High Sensitivity (Screening)',
    threshold: 0.0450,
    description: 'Optimized for high recall (Sensitivity ~85–90%). Suitable for preliminary population screening to catch nearly all suspected LV abnormalities.'
  },
  {
    id: 'high_spec',
    name: 'High Specificity (Confirmatory)',
    threshold: 0.1800,
    description: 'Optimized for high precision (Specificity ~85–90%). Drastically cuts down false alarms before triggering invasive workup or echocardiography re-scans.'
  }
];
