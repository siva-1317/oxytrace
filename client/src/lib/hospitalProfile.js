export const defaultHospitalProfile = {
  hospital_name: 'OxyTrace Medical Center',
  contact_name: '',
  email: '',
  phone: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'India'
};

const STORAGE_KEY = 'oxytrace-hospital-profile';

export function loadHospitalProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultHospitalProfile };
    const parsed = JSON.parse(raw);
    return { ...defaultHospitalProfile, ...(parsed || {}) };
  } catch {
    return { ...defaultHospitalProfile };
  }
}

export function saveHospitalProfile(profile) {
  const merged = { ...defaultHospitalProfile, ...(profile || {}) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function syncHospitalProfile(profile) {
  return saveHospitalProfile(profile);
}

export function getHospitalAddressLines(profile) {
  const data = { ...defaultHospitalProfile, ...(profile || {}) };
  const line1 = [data.address_line_1, data.address_line_2].filter(Boolean).join(', ');
  const line2 = [data.city, data.state, data.postal_code, data.country].filter(Boolean).join(', ');
  return [line1, line2].filter(Boolean);
}
