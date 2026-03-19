export interface BookingRequest {
  serviceName: string;
  professionalName: string;
  date: string;      // YYYY-MM-DD
  time: string;      // HH:mm
  clientPhone: string;
  clientName?: string;
}

export interface TimeSlot {
  time: string;      // HH:mm
  available: boolean;
}

export interface AppointmentDetails {
  id: number;
  serviceName: string;
  servicePrice: number;
  professionalName: string;
  dateTime: Date;
  endTime: Date;
  status: string;
  clientPhone: string;
  clientName?: string;
}
