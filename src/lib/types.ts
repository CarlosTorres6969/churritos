
// Tipos para las respuestas de la API
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface Personal {
  id_personal: number
  nombre: string
  apellido: string
  telefono: string
  direccion: string
  email: string
  fecha_registro: Date | string
  usuario: string
  contrasena: string
  rol: "vendedor" | "administrador"
  fecha_contratacion: Date | string
  activo: boolean
}

// Tipos para las entidades principales
export interface Persona {
  id_persona?: number
  nombre: string
  apellido: string
  telefono?: string
  direccion?: string
  email?: string
  fecha_registro?: Date
  activo?: boolean
}

export interface Clientes {
  id_cliente?: number;
  nombre: string;
  apellido: string;
  telefono?: string | null;
  direccion: string;
  email?: string | null;
  fecha_registro?: Date | string;
  id_ruta?: number | null;
  dia_visita?: number | null; // 1-7 (lunes-domingo)
  activo?: boolean;
  tipo_cliente?: 'normal' | 'medio' | 'mayorista';
  ultima_visita?: string | null; // Formato DD/MM/YY
  ruta_nombre?: string; // Solo para consultas JOIN
}

export interface Producto {
  id_producto?: number
  codigo: string
  nombre: string
  descripcion?: string
  precio_completo: number
  precio_medio: number
  precio_mayorista: number
  activo?: boolean
}

export interface Ruta {
  id_ruta?: number
  nombre: string
  descripcion?: string
  id_personal_asignado?: number
  activa?: boolean
}

export interface InventarioRuta {
  id_inventario_ruta?: number
  id_ruta: number
  id_producto: number
  cantidad: number
  fecha_actualizacion?: Date
}

//export interface Venta {
  //id_venta?: number
  //id_cliente: number
  //id_personal: number
  //fecha_venta?: Date
  //total: number
  //tipo_pago: string
  //cerrada?: boolean
  //efectivo_recibido?: number
  //detalles_venta: DetalleVenta[]
//}

//export interface DetalleVenta {
 // id_detalle_venta?: number
  //id_venta?: number
  //id_producto: number
  //cantidad: number
  //subtotal: number
//}

export interface Factura {
  id_factura?: number
  id_venta: number
  id_cai: number
  numero_factura: string
  fecha_emision?: Date
  monto_total: number
  anulada?: boolean
}

export interface CAI {
  id_cai?: number
  codigo_cai: string
  fecha_inicio: Date
  fecha_fin: Date
  rango_inicial: number
  rango_final: number
  activo?: boolean
}

export interface LimiteCredito {
  id_limite_credito?: number
  id_personal: number
  monto_maximo: number
  monto_actual: number
  fecha_asignacion?: Date
}

export interface EstadoVisitaDTO {
  id_estado_visita?: number
  id_venta?: number
  id_cliente: number
  estado: string
  fecha_visita?: Date
  observaciones?: string
}

export interface Venta {
  id_cliente: number;
  id_personal: number;
  tipo_pago: "efectivo" | "credito";
  efectivo_recibido?: number;
  detalles_venta: DetalleVenta[];
}

export interface DetalleVenta {
  id_producto: number;
  cantidad: number;
  tipo_precio: "completo" | "medio";
}