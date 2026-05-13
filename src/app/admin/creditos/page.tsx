"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CreditCard, Users, AlertTriangle, TrendingUp } from "lucide-react";

interface Cliente {
  id_cliente: number;
  nombre: string;
  ruta: string;
  telefono?: string;
}

interface ClienteCredito {
  id_credito: number;
  id_cliente: number;
  limite_credito: number;
  saldo_actual: number;
  saldo_vencido: number;
  fecha_actualizacion: string;
  activo: boolean;
  dias_credito: number;
  tasa_interes: number;
}

interface CreditoCliente extends ClienteCredito {
  cliente: string;
  ruta: string;
  telefono?: string;
}

export default function GestionCliente() {
  const [ClienteClientes, setClienteClientes] = useState<CreditoCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      // Fetch créditos
      const responseCliente = await fetch("/API/Cliente-Credito?activo=true");
      if (!responseCliente.ok) {
        throw new Error("Error al obtener créditos");
      }
      const { data: Cliente } = await responseCliente.json();

      // Fetch clientes (assuming an API endpoint for clients)
      const responseClientes = await fetch("/API/Clientes");
      if (!responseClientes.ok) {
        throw new Error("Error al obtener clientes");
      }
      const { data: clientesData } = await responseClientes.json();

      // Combine créditos with cliente data
      const ClienteConClientes = Cliente.map((credito: ClienteCredito) => {
        const cliente = clientesData.find((c: Cliente) => c.id_cliente === credito.id_cliente);
        return {
          ...credito,
          cliente: cliente?.nombre || "Cliente desconocido",
          ruta: cliente?.ruta || "Sin ruta",
          telefono: cliente?.telefono,
        };
      });

      setClienteClientes(ClienteConClientes);
    } catch (error) {
      setError("Error al cargar datos");
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const calcularDiasVencido = (fechaActualizacion: string, diasCredito: number): number => {
    const fecha = new Date(fechaActualizacion);
    const fechaVencimiento = new Date(fecha.getTime() + diasCredito * 24 * 60 * 60 * 1000);
    const hoy = new Date();
    const diferencia = Math.floor((hoy.getTime() - fechaVencimiento.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(0, diferencia);
  };

  const obtenerEstadoCredito = (credito: CreditoCliente) => {
    const diasVencido = calcularDiasVencido(credito.fecha_actualizacion, credito.dias_credito);

    if (!credito.activo) {
      return { estado: "inactivo", color: "secondary", texto: "Inactivo" };
    }
    if (credito.saldo_vencido > 0 || diasVencido > 0) {
      return { estado: "vencido", color: "destructive", texto: "Vencido" };
    }

    const fechaActualizacion = new Date(credito.fecha_actualizacion);
    const fechaVencimiento = new Date(fechaActualizacion.getTime() + credito.dias_credito * 24 * 60 * 60 * 1000);
    const hoy = new Date();
    const diasRestantes = Math.floor((fechaVencimiento.getTime() - hoy.getTime()) / (24 * 60 * 60 * 1000));

    if (diasRestantes <= 3) {
      return { estado: "por_vencer", color: "secondary", texto: "Por vencer" };
    }

    return { estado: "vigente", color: "default", texto: "Vigente" };
  };

  const totalCliente = ClienteClientes.reduce((sum, c) => sum + c.saldo_actual, 0);
  const totalVencido = ClienteClientes.reduce((sum, c) => sum + c.saldo_vencido, 0);
  const clientesConCredito = ClienteClientes.length;
  const clientesVencidos = ClienteClientes.filter((c) => c.saldo_vencido > 0).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div>Cargando créditos...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Gestión de Créditos</h1>
                <p className="text-sm text-gray-600">Monitorea créditos por cliente</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Estadísticas generales */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Créditos</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">L. {totalCliente.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">saldo pendiente</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Créditos Vencidos</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">L. {totalVencido.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{clientesVencidos} clientes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clientes con Crédito</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{clientesConCredito}</div>
              <p className="text-xs text-muted-foreground">clientes activos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Promedio por Cliente</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                L. {clientesConCredito > 0 ? (totalCliente / clientesConCredito).toFixed(2) : "0.00"}
              </div>
              <p className="text-xs text-muted-foreground">promedio</p>
            </CardContent>
          </Card>
        </div>

        {/* Lista de créditos por cliente */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ClienteClientes.map((credito) => {
            const estadoCredito = obtenerEstadoCredito(credito);
            const diasVencido = calcularDiasVencido(credito.fecha_actualizacion, credito.dias_credito);
            const porcentajeUtilizado = (credito.saldo_actual / credito.limite_credito) * 100;

            return (
              <Card key={credito.id_credito} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{credito.cliente}</CardTitle>
                      <p className="text-sm text-gray-600">{credito.ruta}</p>
                      {credito.telefono && <p className="text-sm text-gray-600">{credito.telefono}</p>}
                    </div>
                    <Badge variant={estadoCredito.color as "default" | "destructive" | "secondary" | "outline" | null | undefined}>
                      {estadoCredito.texto}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Saldo Actual:</span>
                      <span className="font-bold">L. {credito.saldo_actual.toFixed(2)}</span>
                    </div>
                    {credito.saldo_vencido > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Saldo Vencido:</span>
                        <span className="font-bold">L. {credito.saldo_vencido.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Límite de Crédito:</span>
                      <span>L. {credito.limite_credito.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Utilización:</span>
                      <span className={porcentajeUtilizado > 80 ? "text-red-600 font-bold" : ""}>
                        {porcentajeUtilizado.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Días de Crédito:</span>
                      <span>{credito.dias_credito} días</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tasa de Interés:</span>
                      <span>{credito.tasa_interes.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Última Actualización:</span>
                      <span>{new Date(credito.fecha_actualizacion).toLocaleDateString("es-HN")}</span>
                    </div>
                    {diasVencido > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Días Vencido:</span>
                        <span className="font-bold">{diasVencido} días</span>
                      </div>
                    )}
                  </div>

                  {/* Barra de progreso del límite */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Límite utilizado</span>
                      <span>{porcentajeUtilizado.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          porcentajeUtilizado > 90
                            ? "bg-red-500"
                            : porcentajeUtilizado > 70
                            ? "bg-yellow-500"
                            : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(porcentajeUtilizado, 100)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {ClienteClientes.length === 0 && (
          <Card>
            <CardContent className="text-center py-8">
              <CreditCard className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay créditos</h3>
              <p className="text-gray-600">No hay clientes con créditos pendientes</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}