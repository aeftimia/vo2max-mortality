#!/usr/bin/env python3
"""
VO2 Max Fitness Model: FRIEND 2022 + Kokkinos 2022

References:
  [1] Kaminsky LA, et al. Updated Reference Standards for Cardiorespiratory
      Fitness ... (FRIEND). Mayo Clin Proc. 2022;97(2):285-293.
  [2] Kokkinos P, et al. Cardiorespiratory Fitness and Mortality Risk Across
      the Spectra of Age, Race, and Sex. J Am Coll Cardiol. 2022;80(6):598-609.
"""

import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from biomarker_model import run_pipeline

# ── FRIEND 2022 percentile data ──────────────────────────────────────────────
# VO2max (mL/kg/min) at percentiles 10–90 by decade and sex
# Source: Kaminsky 2022, Table 1 (treadmill, RER >= 1.0 preferred)

FRIEND_2022_DATA = {
    'male': {
        '20-29': {10: 30.0, 20: 35.9, 30: 39.1, 40: 42.1, 50: 44.8, 60: 47.5, 70: 50.4, 80: 53.5, 90: 57.7},
        '30-39': {10: 28.5, 20: 33.6, 30: 37.1, 40: 40.0, 50: 42.4, 60: 44.8, 70: 47.5, 80: 50.6, 90: 54.7},
        '40-49': {10: 26.2, 20: 30.9, 30: 34.3, 40: 37.0, 50: 39.4, 60: 41.8, 70: 44.8, 80: 48.2, 90: 52.5},
        '50-59': {10: 22.9, 20: 26.8, 30: 29.9, 40: 32.3, 50: 34.8, 60: 37.2, 70: 39.8, 80: 43.2, 90: 47.5},
        '60-69': {10: 20.0, 20: 23.6, 30: 26.4, 40: 28.7, 50: 30.9, 60: 33.1, 70: 35.4, 80: 38.6, 90: 42.4},
        '70-79': {10: 17.8, 20: 20.8, 30: 23.0, 40: 25.0, 50: 26.9, 60: 28.7, 70: 30.8, 80: 33.4, 90: 37.2},
        '80-89': {10: 15.4, 20: 17.9, 30: 19.8, 40: 21.5, 50: 23.0, 60: 24.5, 70: 26.0, 80: 28.0, 90: 31.0},
    },
    'female': {
        '20-29': {10: 23.0, 20: 27.4, 30: 30.3, 40: 32.9, 50: 35.2, 60: 37.5, 70: 40.0, 80: 43.0, 90: 46.6},
        '30-39': {10: 20.9, 20: 24.9, 30: 27.7, 40: 30.0, 50: 31.9, 60: 33.8, 70: 36.1, 80: 38.7, 90: 42.0},
        '40-49': {10: 19.3, 20: 23.0, 30: 25.7, 40: 27.9, 50: 29.7, 60: 31.6, 70: 33.8, 80: 36.4, 90: 39.8},
        '50-59': {10: 17.5, 20: 20.8, 30: 23.2, 40: 25.2, 50: 26.9, 60: 28.7, 70: 30.8, 80: 33.2, 90: 36.0},
        '60-69': {10: 15.5, 20: 18.3, 30: 20.4, 40: 22.2, 50: 23.8, 60: 25.5, 70: 27.3, 80: 29.4, 90: 31.9},
        '70-79': {10: 13.7, 20: 16.0, 30: 17.7, 40: 19.3, 50: 20.7, 60: 22.2, 70: 23.8, 80: 25.6, 90: 28.0},
        '80-89': {10: 12.2, 20: 14.2, 30: 15.6, 40: 16.9, 50: 18.1, 60: 19.4, 70: 20.7, 80: 22.2, 90: 24.5},
    }
}

AGE_BIN_SPECS = [
    ('20-29', 20, 30), ('30-39', 30, 40), ('40-49', 40, 50),
    ('50-59', 50, 60), ('60-69', 60, 70), ('70-79', 70, 80), ('80-89', 80, 90),
]

# ── Kokkinos 2022 HR constants ───────────────────────────────────────────────
HR_PER_MET = 0.86
HR_PER_MET_CI = (0.85, 0.87)

# Physiological VO2 max floor (mL/kg/min)
# Source: Shephard 2009. Independence threshold ~15-18; clinical floor ~10-12.
VO2_FLOOR = 10.0

# ── Pipeline config ──────────────────────────────────────────────────────────

CONFIG = {
    'name': 'VO2 Max (FRIEND 2022)',
    'raw_data': FRIEND_2022_DATA,
    'age_bin_specs': AGE_BIN_SPECS,
    'floor': VO2_FLOOR,
    'age_range': (20, 90),
    'unit': 'mL/kg/min',
    'unit_divisor': 3.5,  # 1 MET = 3.5 mL/kg/min
    'hr': {
        'central': {'male': HR_PER_MET, 'female': HR_PER_MET},
        'lo': {'male': HR_PER_MET_CI[0], 'female': HR_PER_MET_CI[0]},
        'hi': {'male': HR_PER_MET_CI[1], 'female': HR_PER_MET_CI[1]},
    },
    'js_var': 'FRIEND_2022_CONTINUOUS',
    'output_file': 'js/data/friend-2022-continuous-data.js',
    'metadata': {
        'model': 'continuous_vo2_fitness_v3',
        'interpolation': {
            'age_direction': 'monotone quadratic histospline (bin-average preserving)',
            'percentile_direction': 'monotone cubic Hermite (PCHIP / Fritsch-Carlson)',
        },
        'source': 'FRIEND 2022, Kokkinos 2022',
        'description': 'Piecewise spline coefficients for VO2max(age, percentile, sex).',
        'references': [
            {
                'title': 'Updated Reference Standards for Cardiorespiratory Fitness...',
                'authors': 'Kaminsky LA, et al.',
                'journal': 'Mayo Clin Proc',
                'year': 2022,
                'volume': '97(2)',
                'pages': '285-293',
                'doi': '10.1016/j.mayocp.2021.08.020',
            },
            {
                'title': 'Cardiorespiratory Fitness and Mortality Risk Across...',
                'authors': 'Kokkinos P, et al.',
                'journal': 'J Am Coll Cardiol',
                'year': 2022,
                'volume': '80(6)',
                'pages': '598-609',
                'doi': '10.1016/j.jacc.2022.05.031',
            },
        ],
        'constants': {
            'HR_per_MET': HR_PER_MET,
            'HR_per_MET_CI': list(HR_PER_MET_CI),
            'MET_divisor': 3.5,
            'VO2_floor': VO2_FLOOR,
        },
    },
}


if __name__ == '__main__':
    run_pipeline(CONFIG)
