import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Save, RotateCcw, Info, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

interface NotificationTemplate {
  id?: number;
  notificationType: 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'RECURRING_EXPENSE';
  titleTemplate: string;
  messageTemplate: string;
  createdAt?: string;
  updatedAt?: string;
}

const NotificationTemplates: React.FC = () => {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);

  const templateTypes = {
    CARD_PAYMENT: {
      name: 'Pagos de Tarjetas',
      variables: ['cardName', 'bankName', 'dueDay', 'debtText', 'days'],
      variableDescriptions: {
        cardName: 'Nombre de la tarjeta',
        bankName: 'Nombre del banco',
        dueDay: 'Día de vencimiento',
        debtText: 'Deuda actual',
        days: 'Días restantes',
      },
    },
    LOAN_PAYMENT: {
      name: 'Pagos de Préstamos',
      variables: ['loanName', 'installmentAmount', 'currency', 'paidInstallments', 'totalInstallments', 'nextPaymentDate', 'days'],
      variableDescriptions: {
        loanName: 'Nombre del préstamo',
        installmentAmount: 'Monto de la cuota',
        currency: 'Moneda',
        paidInstallments: 'Cuotas pagadas',
        totalInstallments: 'Total de cuotas',
        nextPaymentDate: 'Fecha del próximo pago',
        days: 'Días restantes',
      },
    },
    RECURRING_EXPENSE: {
      name: 'Gastos Recurrentes',
      variables: ['description', 'amount', 'currency', 'paymentDay', 'days'],
      variableDescriptions: {
        description: 'Descripción del gasto',
        amount: 'Monto',
        currency: 'Moneda',
        paymentDay: 'Día de pago',
        days: 'Días restantes',
      },
    },
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const response = await api.get('/templates');
      setTemplates(response.data.templates || []);
    } catch (error: any) {
      console.error('Error fetching templates:', error);
      toast.error('Error al cargar plantillas');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template: NotificationTemplate) => {
    setEditingTemplate({ ...template });
  };

  const handleSave = async (type: string) => {
    if (!editingTemplate || editingTemplate.notificationType !== type) {
      return;
    }

    try {
      setSaving(type);
      await api.put(`/templates/${type}`, {
        titleTemplate: editingTemplate.titleTemplate,
        messageTemplate: editingTemplate.messageTemplate,
      });
      toast.success('Plantilla actualizada exitosamente');
      await fetchTemplates();
      setEditingTemplate(null);
    } catch (error: any) {
      console.error('Error saving template:', error);
      toast.error('Error al guardar plantilla');
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async (type: string) => {
    if (!window.confirm('¿Estás seguro de restaurar la plantilla a los valores por defecto?')) {
      return;
    }

    try {
      setSaving(type);
      await api.post(`/templates/${type}/reset`);
      toast.success('Plantilla restaurada a valores por defecto');
      await fetchTemplates();
      setEditingTemplate(null);
    } catch (error: any) {
      console.error('Error resetting template:', error);
      toast.error('Error al restaurar plantilla');
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async (type: string) => {
    try {
      setTesting(type);
      const response = await api.post(`/templates/${type}/test`);
      if (response.data.success) {
        toast.success('Mensaje de prueba enviado. Revisa tu Telegram.');
      } else {
        toast.error(response.data.message || 'Error al enviar mensaje de prueba');
      }
    } catch (error: any) {
      console.error('Error testing template:', error);
      toast.error(error.response?.data?.message || 'Error al enviar mensaje de prueba');
    } finally {
      setTesting(null);
    }
  };

  const getTemplate = (type: string): NotificationTemplate | undefined => {
    return templates.find((t) => t.notificationType === type);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-white">Cargando plantillas...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto py-2 sm:py-4">
      <div className="mb-6 sm:mb-8">
        <div className="flex items-start gap-2 sm:space-x-3 mb-2">
          <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-primary-400 shrink-0 mt-0.5" />
          <h1 className="page-title leading-tight truncate">Plantillas de Notificaciones</h1>
        </div>
        <p className="text-dark-400 text-sm sm:text-base leading-relaxed">
          Personaliza los mensajes que se enviarán por Telegram para cada tipo de notificación.
          Usa las variables disponibles entre llaves {'{variable}'} para insertar información dinámica.
        </p>
      </div>

      <div className="space-y-6">
        {Object.entries(templateTypes).map(([type, config]) => {
          const template = getTemplate(type) || {
            notificationType: type as any,
            titleTemplate: '',
            messageTemplate: '',
          };
          const isEditing = editingTemplate?.notificationType === type;

          return (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
                <h2 className="text-lg sm:text-xl font-semibold text-white">{config.name}</h2>
                <div className="flex flex-wrap gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleSave(type)}
                        disabled={saving === type}
                        className="btn-primary flex items-center space-x-2"
                      >
                        <Save size={18} />
                        <span>{saving === type ? 'Guardando...' : 'Guardar'}</span>
                      </button>
                      <button
                        onClick={() => setEditingTemplate(null)}
                        className="btn-secondary"
                        disabled={saving === type}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEdit(template)}
                        className="btn-primary flex items-center space-x-2"
                      >
                        <FileText size={18} />
                        <span>Editar</span>
                      </button>
                      <button
                        onClick={() => handleTest(type)}
                        disabled={testing === type}
                        className="btn-secondary flex items-center space-x-2"
                      >
                        <Send size={18} />
                        <span>{testing === type ? 'Enviando...' : 'Probar'}</span>
                      </button>
                      <button
                        onClick={() => handleReset(type)}
                        disabled={saving === type || testing === type}
                        className="btn-secondary flex items-center space-x-2"
                      >
                        <RotateCcw size={18} />
                        <span>Restaurar</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {/* Variables disponibles */}
                <div className="bg-dark-700 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Info className="w-5 h-5 text-primary-400" />
                    <h3 className="font-medium text-white">Variables Disponibles</h3>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {config.variables.map((variable) => (
                      <span
                        key={variable}
                        className="px-3 py-1 bg-dark-600 text-primary-400 rounded-md text-sm font-mono"
                        title={config.variableDescriptions[variable as keyof typeof config.variableDescriptions]}
                      >
                        {'{' + variable + '}'}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Título */}
                <div>
                  <label className="label">Título de la Notificación</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingTemplate.titleTemplate}
                      onChange={(e) =>
                        setEditingTemplate({ ...editingTemplate, titleTemplate: e.target.value })
                      }
                      className="input w-full"
                      placeholder="Ej: Recordatorio de Pago de Tarjeta"
                    />
                  ) : (
                    <div className="input w-full bg-dark-700 text-white">{template.titleTemplate || 'Sin título'}</div>
                  )}
                </div>

                {/* Mensaje */}
                <div>
                  <label className="label">Mensaje</label>
                  {isEditing ? (
                    <textarea
                      value={editingTemplate.messageTemplate}
                      onChange={(e) =>
                        setEditingTemplate({ ...editingTemplate, messageTemplate: e.target.value })
                      }
                      className="input w-full h-40 resize-none"
                      placeholder="Escribe el mensaje aquí. Usa {variable} para insertar valores dinámicos."
                    />
                  ) : (
                    <div className="input w-full bg-dark-700 text-white min-h-[100px] whitespace-pre-wrap">
                      {template.messageTemplate || 'Sin mensaje'}
                    </div>
                  )}
                  <p className="text-xs text-dark-400 mt-1">
                    Puedes usar HTML básico como {'<b>texto</b>'} para negrita y {'\n'} para saltos de línea.
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default NotificationTemplates;
