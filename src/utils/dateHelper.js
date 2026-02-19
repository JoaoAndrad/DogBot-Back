const { DateTime } = require("luxon");

const TIMEZONE = "America/Sao_Paulo";

/**
 * Get current date/time in São Paulo timezone
 * @returns {DateTime} Luxon DateTime object in São Paulo timezone
 */
function nowInSaoPaulo() {
  return DateTime.now().setZone(TIMEZONE);
}

/**
 * Get today's date in DD/MM/YYYY format (São Paulo timezone)
 * @returns {string} Date in DD/MM/YYYY format
 */
function getTodayBR() {
  const now = nowInSaoPaulo();
  return now.toFormat("dd/MM/yyyy");
}

/**
 * Get current month key in MM/YYYY format
 * @returns {string} Month key in MM/YYYY format
 */
function getCurrentMonthKeyBR() {
  const now = nowInSaoPaulo();
  return now.toFormat("MM/yyyy");
}

/**
 * Get current year
 * @returns {number} Current year
 */
function getCurrentYearBR() {
  return nowInSaoPaulo().year;
}

/**
 * Get month name in Portuguese
 * @param {string} monthKey - Month key in MM/YYYY format (e.g., "02/2026")
 * @returns {string} Month name in Portuguese (e.g., "Fevereiro")
 */
function getMonthNameBR(monthKey) {
  const [month, year] = monthKey.split("/");
  const date = DateTime.fromObject(
    {
      month: parseInt(month),
      year: parseInt(year),
    },
    { zone: TIMEZONE },
  );

  const monthName = date.setLocale("pt-BR").toFormat("MMMM");
  // Capitalize first letter
  return monthName.charAt(0).toUpperCase() + monthName.slice(1);
}

/**
 * Get last month key in MM/YYYY format
 * @returns {string} Last month key
 */
function getLastMonthKeyBR() {
  const now = nowInSaoPaulo().minus({ months: 1 });
  return now.toFormat("MM/yyyy");
}

/**
 * Calculate days difference between two dates
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {number} Number of days difference
 */
function daysDifference(date1, date2) {
  const dt1 = DateTime.fromJSDate(new Date(date1), { zone: TIMEZONE });
  const dt2 = DateTime.fromJSDate(new Date(date2), { zone: TIMEZONE });
  return Math.floor(dt2.diff(dt1, "days").days);
}

/**
 * Format timestamp to DD/MM/YYYY HH:mm
 * @param {Date|string} timestamp - Timestamp to format
 * @returns {string} Formatted date and time
 */
function formatDateTimeBR(timestamp) {
  const dt = DateTime.fromJSDate(new Date(timestamp), { zone: TIMEZONE });
  return dt.toFormat("dd/MM/yyyy HH:mm");
}

/**
 * Check if it's the 1st day of the month (São Paulo time)
 * @returns {boolean} True if today is the 1st day of the month
 */
function isFirstDayOfMonth() {
  return nowInSaoPaulo().day === 1;
}

/**
 * Get month names array in Portuguese
 * @returns {string[]} Array of month names
 */
function getMonthNamesBR() {
  return [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
}

/**
 * Get current month name
 * @returns {string} Current month name in Portuguese
 */
function getCurrentMonthName() {
  const monthNames = getMonthNamesBR();
  return monthNames[nowInSaoPaulo().month - 1];
}

module.exports = {
  nowInSaoPaulo,
  getTodayBR,
  getCurrentMonthKeyBR,
  getCurrentYearBR,
  getMonthNameBR,
  getLastMonthKeyBR,
  daysDifference,
  formatDateTimeBR,
  isFirstDayOfMonth,
  getMonthNamesBR,
  getCurrentMonthName,
  TIMEZONE,
};
