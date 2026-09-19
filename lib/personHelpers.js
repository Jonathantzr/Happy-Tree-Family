import { Alert } from 'react-native';

// Turns a JS Date object into "DD/MM/YYYY" for display
function formatDateDisplay(date) {
  if (!date) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

// Turns a JS Date object into "YYYY-MM-DD" for saving to the database
function toISODate(date) {
  if (!date) return null;
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

// Turns a database date string ("YYYY-MM-DD") into "DD/MM/YYYY" for display
function formatISOToDisplay(isoStr) {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}

// Decides what to show under a person's name: a date range if both birth and
// death are known, a single date if only one is known, "Deceased" only as a
// last resort if there's no date at all, or nothing if there's truly no info.
function formatPersonMeta(item) {
  const born = item.birth_date ? formatISOToDisplay(item.birth_date) : null;
  const died = item.death_date ? formatISOToDisplay(item.death_date) : null;

  if (born && died) return `${born} - ${died}`;
  if (born) return born;
  if (died) return died;
  if (item.is_deceased) return 'Deceased';
  return '';
}
// Turns "YYYY-MM-DD" from the database into a JS Date (to pre-fill the date picker)
function isoToDate(isoStr) {
  if (!isoStr) return null;
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Shows a Yes/No popup and waits for the answer (true = Yes)
function askYesNo(title, message) {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'No', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Yes', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

export { formatDateDisplay, toISODate, formatISOToDisplay, formatPersonMeta, isoToDate, askYesNo };