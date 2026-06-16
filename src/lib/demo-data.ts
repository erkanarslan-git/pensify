export type RoomStatus =
  | "available"
  | "occupied"
  | "checkout_today"
  | "cleaning_required"
  | "cleaning_in_progress"
  | "cleaned"
  | "maintenance";

export type ReservationSource = "Airbnb" | "Booking.com" | "Website" | "Phone" | "Walk-in";

export type CleaningStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "completed"
  | "problem";

export interface City {
  id: string;
  name: string;
}
export interface Property {
  id: string;
  name: string;
  cityId: string;
  address: string;
}
export interface Room {
  id: string;
  number: string;
  propertyId: string;
  status: RoomStatus;
  capacity: number;
}
export interface Reservation {
  id: string;
  guestName: string;
  source: ReservationSource;
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  roomId: string;
  guests: number;
  notes?: string;
  revenue: number;
}
export interface Cleaner {
  id: string;
  name: string;
  phone: string;
  regions: string[]; // city ids
  active: boolean;
}
export interface CleaningTask {
  id: string;
  roomId: string;
  propertyId: string;
  cleanerId: string;
  dueTime: string; // ISO
  status: CleaningStatus;
  notes?: string;
  photos: number;
}

export const cities: City[] = [
  { id: "berlin", name: "Berlin" },
  { id: "cologne", name: "Cologne" },
  { id: "munich", name: "Munich" },
];

export const properties: Property[] = [
  { id: "p1", name: "Pension Alexander", cityId: "berlin", address: "Alexanderplatz 12, Berlin" },
  { id: "p2", name: "Kreuzberg Lofts", cityId: "berlin", address: "Oranienstraße 45, Berlin" },
  { id: "p3", name: "Pension Central", cityId: "cologne", address: "Domkloster 4, Cologne" },
  { id: "p4", name: "Rhein Apartments", cityId: "cologne", address: "Rheinufer 8, Cologne" },
  { id: "p5", name: "Isar Guesthouse", cityId: "munich", address: "Maximilianstraße 22, Munich" },
];

const mkRooms = (): Room[] => {
  const rooms: Room[] = [];
  const statuses: RoomStatus[] = [
    "available", "occupied", "checkout_today", "cleaning_required",
    "cleaning_in_progress", "cleaned", "maintenance", "occupied", "available",
  ];
  properties.forEach((p, pi) => {
    for (let i = 1; i <= 6; i++) {
      rooms.push({
        id: `${p.id}-r${i}`,
        number: `${(pi + 1) * 100 + i}`,
        propertyId: p.id,
        status: statuses[(pi * 6 + i) % statuses.length],
        capacity: (i % 3) + 1,
      });
    }
  });
  return rooms;
};
export const rooms: Room[] = mkRooms();

const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d;
};

const guestNames = [
  "Anna Schmidt", "Lukas Müller", "Emma Weber", "Felix Fischer", "Sophia Wagner",
  "Max Becker", "Mia Hoffmann", "Paul Schulz", "Lena Koch", "Jonas Richter",
  "Hannah Klein", "Leon Wolf", "Marie Neumann", "Tim Schwarz", "Laura Zimmermann",
  "Noah Braun", "Lara Krüger", "Finn Hartmann", "Clara Lange", "David Schmitt",
];
const sources: ReservationSource[] = ["Airbnb", "Booking.com", "Website", "Phone", "Walk-in"];

const mkReservations = (): Reservation[] => {
  const res: Reservation[] = [];
  rooms.forEach((r, i) => {
    // past stay
    res.push({
      id: `res-${i}-a`,
      guestName: guestNames[(i * 3) % guestNames.length],
      source: sources[i % sources.length],
      checkIn: iso(addDays(-5 + (i % 3))),
      checkOut: iso(addDays(i % 3 === 0 ? 0 : -1 + (i % 2))),
      roomId: r.id,
      guests: (i % 3) + 1,
      revenue: 95 + (i % 7) * 18,
      notes: i % 4 === 0 ? "Late check-in requested" : undefined,
    });
    // upcoming
    if (i % 2 === 0) {
      res.push({
        id: `res-${i}-b`,
        guestName: guestNames[(i * 5 + 1) % guestNames.length],
        source: sources[(i + 2) % sources.length],
        checkIn: iso(addDays(1 + (i % 5))),
        checkOut: iso(addDays(4 + (i % 6))),
        roomId: r.id,
        guests: ((i + 1) % 3) + 1,
        revenue: 110 + (i % 5) * 22,
      });
    }
  });
  return res;
};
export const reservations: Reservation[] = mkReservations();

export const cleaners: Cleaner[] = [
  { id: "c1", name: "Magdalena Kowalski", phone: "+49 151 2345 6701", regions: ["berlin"], active: true },
  { id: "c2", name: "Ahmet Yıldız", phone: "+49 151 2345 6702", regions: ["berlin", "cologne"], active: true },
  { id: "c3", name: "Sofia Rossi", phone: "+49 151 2345 6703", regions: ["cologne"], active: true },
  { id: "c4", name: "Petra Hoffmann", phone: "+49 151 2345 6704", regions: ["munich"], active: true },
  { id: "c5", name: "Andrei Popescu", phone: "+49 151 2345 6705", regions: ["berlin"], active: false },
];

const cleaningStatuses: CleaningStatus[] = [
  "pending", "accepted", "in_progress", "completed", "problem", "pending", "completed",
];
export const cleaningTasks: CleaningTask[] = rooms
  .filter((r) =>
    ["checkout_today", "cleaning_required", "cleaning_in_progress", "cleaned"].includes(r.status),
  )
  .map((r, i) => {
    const prop = properties.find((p) => p.id === r.propertyId)!;
    const eligibleCleaners = cleaners.filter(
      (c) => c.active && c.regions.includes(prop.cityId),
    );
    const cleaner = eligibleCleaners[i % eligibleCleaners.length] ?? cleaners[0];
    const due = new Date(today);
    due.setHours(11 + (i % 4), 0, 0, 0);
    return {
      id: `task-${i}`,
      roomId: r.id,
      propertyId: r.propertyId,
      cleanerId: cleaner.id,
      dueTime: due.toISOString(),
      status: cleaningStatuses[i % cleaningStatuses.length],
      photos: i % 3,
      notes: i % 5 === 0 ? "Guest left late, hurry please" : undefined,
    };
  });

export const sourceColors: Record<ReservationSource, string> = {
  "Airbnb": "oklch(0.65 0.2 15)",
  "Booking.com": "oklch(0.55 0.19 260)",
  "Website": "oklch(0.65 0.16 155)",
  "Phone": "oklch(0.78 0.15 75)",
  "Walk-in": "oklch(0.6 0.05 260)",
};

export const roomStatusMeta: Record<
  RoomStatus,
  { label: string; tone: "success" | "info" | "warning" | "destructive" | "muted" | "primary" }
> = {
  available: { label: "Available", tone: "success" },
  occupied: { label: "Occupied", tone: "info" },
  checkout_today: { label: "Check-out Today", tone: "warning" },
  cleaning_required: { label: "Cleaning Required", tone: "destructive" },
  cleaning_in_progress: { label: "Cleaning…", tone: "primary" },
  cleaned: { label: "Cleaned", tone: "success" },
  maintenance: { label: "Maintenance", tone: "muted" },
};

export const cleaningStatusMeta: Record<
  CleaningStatus,
  { label: string; tone: "success" | "info" | "warning" | "destructive" | "muted" | "primary" }
> = {
  pending: { label: "Pending", tone: "warning" },
  accepted: { label: "Accepted", tone: "info" },
  in_progress: { label: "In Progress", tone: "primary" },
  completed: { label: "Completed", tone: "success" },
  problem: { label: "Problem", tone: "destructive" },
};

export const getCity = (id: string) => cities.find((c) => c.id === id);
export const getProperty = (id: string) => properties.find((p) => p.id === id);
export const getRoom = (id: string) => rooms.find((r) => r.id === id);
export const getCleaner = (id: string) => cleaners.find((c) => c.id === id);
