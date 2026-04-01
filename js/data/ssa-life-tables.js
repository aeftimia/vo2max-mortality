/**
 * US Life Tables 2021 — Exact Integer-Age q(x) Values
 * Source: CDC National Center for Health Statistics
 * National Vital Statistics Reports, Vol. 72, No. 12 (November 2023)
 * "United States Life Tables, 2021"
 * https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Publications/NVSR/72-12/
 * Table 2 (males) and Table 3 (females).
 * Public domain — US federal government work.
 *
 * q(x) = probability of dying within one year at exact age x.
 * Ages 0–99 are exact values from the NVSS table.
 * Ages 100–119 use log-linear extrapolation anchored at age 99.
 * Age 100 in the NVSS table represents "100 and over" (q=1.0 by convention);
 * we extrapolate smoothly rather than using q=1.0 at 100.
 *
 * Note: The CDC NVSS and SSA Period Life Tables both derive from the same
 * underlying US mortality data. Values are essentially equivalent for
 * our purposes (differences < 1% at any age).
 */

// Ages 0–99: direct from NVSS Table 2 (males)
const NVSS_MALE_QX = [
  0.0058331690, 0.0004159185, 0.0002740231, 0.0002240962, 0.0001751495, 0.0001608388, 0.0001494664, 0.0001372527, 0.0001191962, 0.0000979525,  // ages 0–9
  0.0000837289, 0.0000928073, 0.0001437872, 0.0002475789, 0.0003924036, 0.0005556684, 0.0007194524, 0.0008846522, 0.0010441638, 0.0011988714,  // ages 10–19
  0.0013608257, 0.0015267693, 0.0016776454, 0.0018053704, 0.0019145359, 0.0020147571, 0.0021163332, 0.0022212968, 0.0023337624, 0.0024508038,  // ages 20–29
  0.0025690608, 0.0026824428, 0.0027886757, 0.0028866804, 0.0029816609, 0.0030806928, 0.0031896774, 0.0033103980, 0.0034460675, 0.0035971741,  // ages 30–39
  0.0037721398, 0.0039638104, 0.0041583939, 0.0043525309, 0.0045598387, 0.0047994968, 0.0050897999, 0.0054309950, 0.0058183861, 0.0062408652,  // ages 40–49
  0.0066794446, 0.0071513830, 0.0076897568, 0.0083161201, 0.0090229642, 0.0097540440, 0.0105098700, 0.0113499789, 0.0122847650, 0.0132864732,  // ages 50–59
  0.0143412706, 0.0154015720, 0.0164368637, 0.0174454339, 0.0184746478, 0.0195758194, 0.0209272746, 0.0223029703, 0.0238039941, 0.0253827721,  // ages 60–69
  0.0269080438, 0.0287036579, 0.0307881981, 0.0333608128, 0.0359440036, 0.0404965878, 0.0440532751, 0.0488096997, 0.0531732664, 0.0589082353,  // ages 70–79
  0.0639535114, 0.0703108609, 0.0769584849, 0.0848127156, 0.0944996104, 0.1043191925, 0.1164283976, 0.1296192259, 0.1439136416, 0.1593168080,  // ages 80–89
  0.1758141220, 0.1933686286, 0.2119191736, 0.2313793451, 0.2516376674, 0.2725590765, 0.2939877808, 0.3157514632, 0.3376664817, 0.3595440984,  // ages 90–99
];

// Ages 0–99: direct from NVSS Table 3 (females)
const NVSS_FEMALE_QX = [
  0.0050404188, 0.0003886097, 0.0002335389, 0.0001582009, 0.0001469225, 0.0001240780, 0.0001094614, 0.0000999799, 0.0000944624, 0.0000929005,  // ages 0–9
  0.0000964412, 0.0001072038, 0.0001277520, 0.0001595739, 0.0002007318, 0.0002474862, 0.0002969596, 0.0003493444, 0.0004034853, 0.0004591794,  // ages 10–19
  0.0005201786, 0.0005835911, 0.0006414750, 0.0006902318, 0.0007331003, 0.0007736900, 0.0008195728, 0.0008758690, 0.0009461397, 0.0010264342,  // ages 20–29
  0.0011109196, 0.0011938654, 0.0012750471, 0.0013537678, 0.0014331227, 0.0015180993, 0.0016106989, 0.0017091872, 0.0018135621, 0.0019245432,  // ages 30–39
  0.0020484636, 0.0021830711, 0.0023209145, 0.0024612669, 0.0026111975, 0.0027838247, 0.0029840954, 0.0032034821, 0.0034355021, 0.0036798054,  // ages 40–49
  0.0039350237, 0.0042173411, 0.0045442111, 0.0049277763, 0.0053613745, 0.0058090300, 0.0062737647, 0.0067951712, 0.0073826606, 0.0080195330,  // ages 50–59
  0.0087028239, 0.0093955155, 0.0100658098, 0.0107060652, 0.0113544762, 0.0120408917, 0.0128799565, 0.0138208875, 0.0149152679, 0.0161875393,  // ages 60–69
  0.0174753368, 0.0189636834, 0.0206155460, 0.0226030871, 0.0246472303, 0.0279328637, 0.0309222974, 0.0345362574, 0.0378570072, 0.0419670306,  // ages 70–79
  0.0463356599, 0.0510844067, 0.0566080995, 0.0628807098, 0.0705823153, 0.0791490301, 0.0878702030, 0.0987118036, 0.1106353626, 0.1236855388,  // ages 80–89
  0.1378933191, 0.1532724500, 0.1698159575, 0.1874929965, 0.2062462717, 0.2259906232, 0.2466127425, 0.2679723501, 0.2899051607, 0.3122272789,  // ages 90–99
];

/**
 * Log-linear extrapolation for ages 100-119.
 * Uses the slope of log(q) at ages 95-99 to project forward.
 */
function extrapolateQx(baseArray, startAge) {
  const result = baseArray.slice();
  const q98 = baseArray[98], q99 = baseArray[99];
  const slope = Math.log(q99) - Math.log(q98);  // log-linear slope
  for (let age = startAge; age < 120; age++) {
    const q = Math.min(Math.exp(Math.log(q99) + (age - 99) * slope), 1.0);
    result.push(q);
  }
  return result;
}

const SSA_LIFE_TABLE = {
  male:   extrapolateQx(NVSS_MALE_QX,   100),
  female: extrapolateQx(NVSS_FEMALE_QX, 100),
};

/**
 * Get annual mortality probability q(age, sex) from the 2021 US life table.
 * @param {number} age  Integer age (0–119); non-integers are floored.
 * @param {'male'|'female'} sex
 * @returns {number} q(x)
 */
function getQx(age, sex) {
  const idx = Math.min(Math.max(Math.floor(age), 0), 119);
  return SSA_LIFE_TABLE[sex][idx];
}

/**
 * Compute remaining life expectancy by integrating survival from startAge,
 * applying an optional mortality multiplier at every future age.
 * @param {number} startAge
 * @param {'male'|'female'} sex
 * @param {number} multiplier  Scales q(x) at every age (default 1.0).
 * @returns {number} Expected remaining years of life.
 */
function lifeExpectancy(startAge, sex, multiplier) {
  multiplier = multiplier || 1.0;
  let survival = 1.0;
  let years = 0;
  for (let age = Math.floor(startAge); age < 119; age++) {
    const q = Math.min(getQx(age, sex) * multiplier, 1.0);
    survival *= (1 - q);
    years += survival;
  }
  return years;
}
