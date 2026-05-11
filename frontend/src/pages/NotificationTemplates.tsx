import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileText, Save, RotateCcw, Info, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useTranslation } from 'react-i18next';

interface NotificationTemplate {
  id?: number;
  notificationType: 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'RECURRING_EXPENSE';
  titleTemplate: string;
  messageTemplate: string;
  createdAt?: string;
  updatedAt?: string;
}

const NotificationTemplates: React.FC = () => {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);

  const templateTypes = useMemo(() => {
    const varsDesc = (keys: readonly string[]) => {
      const o: Record<string, string> = {};
      keys.forEach((k) => {
        o[k] = t(`templates.vars.${k}`);
      });
      return o;
    };

    const cardVars = [
      'bankName',
      'cardName',
      'currencyType',
      'currencyTypeLabel',
      'creditLimitDop',
      'creditLimitUsd',
      'currentDebtDop',
      'currentDebtUsd',
      'minimumPaymentDop',
      'minimumPaymentUsd',
      'cutOffDay',
      'dueDay',
      'debtText',
      'days',
    ] as const;

    const loanVars = [
      'loanName',
      'installmentAmount',
      'currency',
      'paidInstallments',
      'totalInstallments',
      'nextPaymentDate',
      'days',
    ] as const;

    const recurringVars = [
      'expenseScheduleLabel',
      'expenseTypeLabel',
      'category',
      'description',
      'amount',
      'currency',
      'paymentDay',
      'days',
    ] as const;

    return {
      CARD_PAYMENT: {
        name: t('templates.types.cardPayment.name'),
        variables: [...cardVars],
        variableDescriptions: varsDesc(cardVars),
        conditionalHelp: t('templates.types.cardPayment.conditionalHelp'),
      },
      LOAN_PAYMENT: {
        name: t('templates.types.loanPayment.name'),
        variables: [...loanVars],
        variableDescriptions: varsDesc(loanVars),
      },
      RECURRING_EXPENSE: {
        name: t('templates.types.recurringExpense.name'),
        variables: [...recurringVars],
        variableDescriptions: varsDesc(recurringVars),
      },
    };
  }, [t]);

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
      toast.error(t('toast.notificationTemplates.loadError'));
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
      toast.success(t('toast.notificationTemplates.updated'));
      await fetchTemplates();
      setEditingTemplate(null);
    } catch (error: any) {
      console.error('Error saving template:', error);
      toast.error(t('toast.notificationTemplates.saveError'));
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async (type: string) => {
    if (!window.confirm(t('confirm.notificationTemplatesReset'))) {
      return;
    }

    try {
      setSaving(type);
      await api.post(`/templates/${type}/reset`);
      toast.success(t('toast.notificationTemplates.restored'));
      await fetchTemplates();
      setEditingTemplate(null);
    } catch (error: any) {
      console.error('Error resetting template:', error);
      toast.error(t('toast.notificationTemplates.restoreError'));
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async (type: string) => {
    try {
      setTesting(type);
      const response = await api.post(`/templates/${type}/test`);
      if (response.data.success) {
        toast.success(t('toast.notificationTemplates.testSent'));
      } else {
        toast.error(response.data.message || t('toast.notificationTemplates.testError'));
      }
    } catch (error: any) {
      console.error('Error testing template:', error);
      toast.error(error.response?.data?.message || t('toast.notificationTemplates.testError'));
    } finally {
      setTesting(null);
    }
  };

  const getTemplate = (type: string): NotificationTemplate | undefined => {
    return templates.find((tpl) => tpl.notificationType === type);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-white">{t('templates.page.loading')}</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto py-2 sm:py-4">
      <div className="mb-6 sm:mb-8 text-center sm:text-left">
        <div className="flex items-start justify-center gap-2 sm:justify-start sm:space-x-3 mb-2">
          <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-primary-400 shrink-0 mt-0.5" />
          <h1 className="page-title leading-tight truncate">{t('templates.page.title')}</h1>
        </div>
        <p className="text-dark-400 text-sm sm:text-base leading-relaxed max-w-prose mx-auto sm:mx-0">
          {t('templates.page.subtitle')}
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
                        <span>{saving === type ? t('templates.page.saving') : t('templates.page.save')}</span>
                      </button>
                      <button
                        onClick={() => setEditingTemplate(null)}
                        className="btn-secondary"
                        disabled={saving === type}
                      >
                        {t('templates.page.cancel')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEdit(template)}
                        className="btn-primary flex items-center space-x-2"
                      >
                        <FileText size={18} />
                        <span>{t('templates.page.edit')}</span>
                      </button>
                      <button
                        onClick={() => handleTest(type)}
                        disabled={testing === type}
                        className="btn-secondary flex items-center space-x-2"
                      >
                        <Send size={18} />
                        <span>{testing === type ? t('templates.page.testSending') : t('templates.page.test')}</span>
                      </button>
                      <button
                        onClick={() => handleReset(type)}
                        disabled={saving === type || testing === type}
                        className="btn-secondary flex items-center space-x-2"
                      >
                        <RotateCcw size={18} />
                        <span>{t('templates.page.restore')}</span>
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
                    <h3 className="font-medium text-white">{t('templates.page.variablesHeading')}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {config.variables.map((variable) => (
                      <span
                        key={variable}
                        className="px-3 py-1 bg-dark-600 text-primary-400 rounded-md text-sm font-mono"
                        title={config.variableDescriptions[variable] ?? variable}
                      >
                        {'{' + variable + '}'}
                      </span>
                    ))}
                  </div>
                  {'conditionalHelp' in config && config.conditionalHelp && (
                    <p className="text-xs text-dark-400 mt-3 leading-relaxed border-t border-dark-600 pt-3">
                      <span className="text-dark-300 font-medium">{t('templates.page.conditionalsLabel')} </span>
                      {config.conditionalHelp}
                    </p>
                  )}
                </div>

                {/* Título */}
                <div>
                  <label className="label">{t('templates.page.notificationTitle')}</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingTemplate.titleTemplate}
                      onChange={(e) =>
                        setEditingTemplate({ ...editingTemplate, titleTemplate: e.target.value })
                      }
                      className="input w-full"
                      placeholder={t('templates.page.placeholderTitle')}
                    />
                  ) : (
                    <div className="input w-full bg-dark-700 text-white">
                      {template.titleTemplate || t('templates.page.emptyTitle')}
                    </div>
                  )}
                </div>

                {/* Mensaje */}
                <div>
                  <label className="label">{t('templates.page.notificationMessage')}</label>
                  {isEditing ? (
                    <textarea
                      value={editingTemplate.messageTemplate}
                      onChange={(e) =>
                        setEditingTemplate({ ...editingTemplate, messageTemplate: e.target.value })
                      }
                      className="input w-full h-40 resize-none"
                      placeholder={t('templates.page.placeholderMessage')}
                    />
                  ) : (
                    <div className="input w-full bg-dark-700 text-white min-h-[100px] whitespace-pre-wrap">
                      {template.messageTemplate || t('templates.page.emptyMessage')}
                    </div>
                  )}
                  <p className="text-xs text-dark-400 mt-1">{t('templates.page.htmlHint')}</p>
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
