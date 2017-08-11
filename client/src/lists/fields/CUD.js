'use strict';

import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { translate, Trans } from 'react-i18next';
import {requiresAuthenticatedUser, withPageHelpers, Title, NavButton} from '../../lib/page';
import {
    withForm, Form, FormSendMethod, InputField, TextArea, TableSelect, ButtonRow, Button,
    Fieldset, Dropdown, AlignedRow, ACEEditor
} from '../../lib/form';
import { withErrorHandling, withAsyncErrorHandler } from '../../lib/error-handling';
import {DeleteModalDialog} from "../../lib/delete";
import { getFieldTypes } from './field-types';
import axios from '../../lib/axios';
import interoperableErrors from '../../../../shared/interoperable-errors';
import validators from '../../../../shared/validators';

@translate()
@withForm
@withPageHelpers
@withErrorHandling
@requiresAuthenticatedUser
export default class CUD extends Component {
    constructor(props) {
        super(props);

        this.state = {};

        this.fieldTypes = getFieldTypes(props.t);

        this.initForm({
            serverValidation: {
                url: `/rest/fields-validate/${this.props.list.id}`,
                changed: ['key'],
                extra: ['id']
            }
        });
    }

    static propTypes = {
        action: PropTypes.string.isRequired,
        list: PropTypes.object,
        entity: PropTypes.object
    }

    @withAsyncErrorHandler
    async loadOrderOptions() {
        const t = this.props.t;

        const flds = await axios.get(`/rest/fields/${this.props.list.id}`);

        const getOrderOptions = fld => {
            return [
                {key: 'none', label: t('Not visible')},
                ...flds.data.filter(x => (!this.props.entity || x.id !== this.props.entity.id) && x[fld] !== null).sort((x, y) => x[fld] - y[fld]).map(x => ({ key: x.id, label: `${x.name} (${this.fieldTypes[x.type].label})`})),
                {key: 'end', label: t('End of list')}
            ];
        };

        this.setState({
            orderListOptions: getOrderOptions('order_list'),
            orderSubscribeOptions: getOrderOptions('order_subscribe'),
            orderManageOptions: getOrderOptions('order_manage')
        });
    }

    componentDidMount() {
        if (this.props.entity) {
            this.getFormValuesFromEntity(this.props.entity, data => {
                if (data.default_value === null) {
                    data.default_value = '';
                }
                // TODO: Construct form fields from settings
            });

        } else {
            this.populateFormValues({
                name: '',
                type: 'text',
                key: '',
                default_value: '',
                group: null,
                renderTemplate: '',
                orderListBefore: 'end', // possible values are <numeric id> / 'end' / 'none'
                orderSubscribeBefore: 'end',
                orderManageBefore: 'end',
                orderListOptions: [],
                orderSubscribeOptions: [],
                orderManageOptions: []
            });
        }

        this.loadOrderOptions();
    }

    localValidateFormValues(state) {
        const t = this.props.t;

        if (!state.getIn(['name', 'value'])) {
            state.setIn(['name', 'error'], t('Name must not be empty'));
        } else {
            state.setIn(['name', 'error'], null);
        }

        const keyServerValidation = state.getIn(['key', 'serverValidation']);
        if (!validators.mergeTagValid(state.getIn(['key', 'value']))) {
            state.setIn(['key', 'error'], t('Merge tag is invalid. May must be uppercase and contain only characters A-Z, 0-9, _. It must start with a letter.'));
        } else if (!keyServerValidation) {
            state.setIn(['key', 'error'], t('Validation is in progress...'));
        } else if (keyServerValidation.exists) {
            state.setIn(['key', 'error'], t('Another field with the same merge tag exists. Please choose another merge tag.'));
        } else {
            state.setIn(['key', 'error'], null);
        }

        // TODO: Validate field settings:
        //   TODO: parse and check options for enums
        //   TODO: make sure group is selected for option
        //   TODO: check default date/birthday is in the right format
        //   TODO: check number is a number
    }

    async submitHandler() {
        const t = this.props.t;

        let sendMethod, url;
        if (this.props.entity) {
            sendMethod = FormSendMethod.PUT;
            url = `/rest/fields/${this.props.list.id}/${this.props.entity.id}`
        } else {
            sendMethod = FormSendMethod.POST;
            url = `/rest/fields/${this.props.list.id}`
        }

        try {
            this.disableForm();
            this.setFormStatusMessage('info', t('Saving field ...'));

            const submitSuccessful = await this.validateAndSendFormValuesToURL(sendMethod, url, data => {
                if (data.default_value.trim() === '') {
                    data.default_value = null;
                }

                // TODO: Construct settings field
            });

            if (submitSuccessful) {
                this.navigateToWithFlashMessage(`/lists/${this.props.list.id}/fields`, 'success', t('Field saved'));
            } else {
                this.enableForm();
                this.setFormStatusMessage('warning', t('There are errors in the form. Please fix them and submit again.'));
            }
        } catch (error) {
            if (error instanceof interoperableErrors.DependencyNotFoundError) {
                this.setFormStatusMessage('danger',
                    <span>
                        <strong>{t('Your updates cannot be saved.')}</strong>{' '}
                        {t('It seems that another field upon which sort field order was established has been deleted in the meantime. Refresh your page to start anew. Please note that your changes will be lost.')}
                    </span>
                );
                return;
            }

            throw error;
        }
    }

    render() {
        const t = this.props.t;
        const isEdit = !!this.props.entity;

        const typeOptions = Object.keys(this.fieldTypes).map(key => ({key, label:this.fieldTypes[key].label}));

        const type = this.getFormValue('type');

        let fieldSettings = null;
        switch (type) {
            case 'text':
            case 'website':
            case 'longtext':
            case 'gpg':
            case 'number':
                fieldSettings =
                    <Fieldset label={t('Field settings')}>
                        <InputField id="default_value" label={t('Default value')} help={t('Default value used when the field is empty.')}/>
                    </Fieldset>;
                break;

            case 'checkbox':
            case 'radio-grouped':
            case 'dropdown-grouped':
                fieldSettings =
                    <Fieldset label={t('Field settings')}>
                        <ACEEditor
                            id="renderTemplate"
                            label={t('Template')}
                            height="250px"
                            mode="handlebars"
                            help={<Trans>You can control the appearance of the merge tag with this template. The template
                                uses handlebars syntax and you can find all values from <code>{'{{values}}'}</code> array, for
                                example <code>{'{{#each values}} {{this}} {{/each}}'}</code>. If template is not defined then
                                multiple values are joined with commas.</Trans>}
                        />
                    </Fieldset>;
                break;

            case 'radio-enum':
            case 'dropdown-enum':
                fieldSettings =
                    <Fieldset label={t('Field settings')}>
                        <ACEEditor
                            id="enumOptions"
                            label={t('Options')}
                            height="250px"
                            mode="text"
                            help={<Trans><div>Specify the options to select from in the following format:<code>key|label</code>. For example:</div>
                                <div><code>au|Australia</code></div><div><code>at|Austria</code></div></Trans>}
                        />
                        <InputField id="default_value" label={t('Default value')} help={<Trans>Default key (e.g. <code>au</code> used when the field is empty.')</Trans>}/>
                        <ACEEditor
                            id="renderTemplate"
                            label={t('Template')}
                            height="250px"
                            mode="handlebars"
                            help={<Trans>You can control the appearance of the merge tag with this template. The template
                                uses handlebars syntax and you can find all values from <code>{'{{values}}'}</code> array.
                                Each entry in the array is an object with attributes <code>key</code> and <code>label</code>.
                                For example <code>{'{{#each values}} {{this.value}} {{/each}}'}</code>. If template is not defined then
                                multiple values are joined with commas.</Trans>}
                        />
                    </Fieldset>;
                break;

            case 'date':
                fieldSettings =
                    <Fieldset label={t('Field settings')}>
                        <Dropdown id="dateFormat" label={t('Date format')}
                            options={[
                                {key: 'us', label: t('MM/DD/YYYY')},
                                {key: 'eur', label: t('DD/MM/YYYY')}
                            ]}
                        />
                        <InputField id="default_value" label={t('Default value')} help={<Trans>Default value used when the field is empty.')</Trans>}/>
                    </Fieldset>;
                break;

            case 'birthday':
                fieldSettings =
                    <Fieldset label={t('Field settings')}>
                        <Dropdown id="dateFormat" label={t('Date format')}
                            options={[
                                {key: 'us', label: t('MM/DD')},
                                {key: 'eur', label: t('DD/MM')}
                            ]}
                        />
                        <InputField id="default_value" label={t('Default value')} help={<Trans>Default value used when the field is empty.')</Trans>}/>
                    </Fieldset>;
                break;

            case 'json':
                fieldSettings = <Fieldset label={t('Field settings')}>
                        <InputField id="default_value" label={t('Default value')} help={<Trans>Default key (e.g. <code>au</code> used when the field is empty.')</Trans>}/>
                        <ACEEditor
                            id="renderTemplate"
                            label={t('Template')}
                            height="250px"
                            mode="json"
                            help={<Trans>You can use this template to render JSON values (if the JSON is an array then the array is
                                exposed as <code>values</code>, otherwise you can access the JSON keys directly).</Trans>}
                        />
                    </Fieldset>;
                break;

            case 'option':
                const fieldsGroupedColumns = [
                    { data: 4, title: "#" },
                    { data: 1, title: t('Name') },
                    { data: 2, title: t('Type'), render: data => this.fieldTypes[data].label, sortable: false, searchable: false },
                    { data: 3, title: t('Merge Tag') }
                ];

                fieldSettings =
                    <Fieldset label={t('Field settings')}>
                        <TableSelect id="group" label={t('Group')} withHeader dropdown dataUrl={`/rest/fields-grouped-table/${this.props.list.id}`} columns={fieldsGroupedColumns} selectionLabelIndex={1} help={t('Select group to which the options should belong.')}/>
                        <InputField id="default_value" label={t('Default value')} help={t('Default value used when the field is empty.')}/>
                    </Fieldset>;
                break;
        }


        return (
            <div>
                {isEdit &&
                    <DeleteModalDialog
                        stateOwner={this}
                        visible={this.props.action === 'delete'}
                        deleteUrl={`/rest/fields/${this.props.list.id}/${this.props.entity.id}`}
                        cudUrl={`/lists/fields/${this.props.list.id}/${this.props.entity.id}/edit`}
                        listUrl={`/lists/fields/${this.props.list.id}`}
                        deletingMsg={t('Deleting field ...')}
                        deletedMsg={t('Field deleted')}/>
                }

                <Title>{isEdit ? t('Edit Field') : t('Create Field')}</Title>

                <Form stateOwner={this} onSubmitAsync={::this.submitHandler}>
                    <InputField id="name" label={t('Name')}/>

                    <Dropdown id="type" label={t('Type')} options={typeOptions}/>

                    <InputField id="key" label={t('Merge tag')}/>

                    {fieldSettings}

                    <Fieldset label={t('Field order')}>
                        <Dropdown id="orderListBefore" label={t('Listings (before)')} options={this.state.orderListOptions} help={t('Select the field before which this field should appeara in listings. To exclude the field from listings, select "Not visible".')}/>
                        <Dropdown id="orderSubscribeBefore" label={t('Subscription form (before)')} options={this.state.orderSubscribeOptions} help={t('Select the field before which this field should appear in new subscription form. To exclude the field from the new subscription form, select "Not visible".')}/>
                        <Dropdown id="orderManageBefore" label={t('Management form (before)')} options={this.state.orderManageOptions} help={t('Select the field before which this field should appear in subscription management. To exclude the field from the subscription management form, select "Not visible".')}/>
                    </Fieldset>

                    <ButtonRow>
                        <Button type="submit" className="btn-primary" icon="ok" label={t('Save')}/>
                        {isEdit && <NavButton className="btn-danger" icon="remove" label={t('Delete')} linkTo={`/lists/fields/${this.props.list.id}/${this.props.entity.id}/delete`}/>}
                    </ButtonRow>
                </Form>
            </div>
        );
    }
}