'use strict';

import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {withTranslation} from '../lib/i18n';
import {requiresAuthenticatedUser, Title, withPageHelpers} from '../lib/page';
import {Button, ButtonRow, Form, FormSendMethod, TableSelect, withForm, withFormErrorHandlers} from '../lib/form';
import {Table} from '../lib/table';
import {HTTPMethod} from '../lib/axios';
import mailtrainConfig from 'mailtrainConfig';
import {withComponentMixins} from "../lib/decorator-helpers";
import {tableAddRestActionButton, tableRestActionDialogInit, tableRestActionDialogRender} from "../lib/modals";

@withComponentMixins([
    withTranslation,
    withForm,
    withPageHelpers,
    requiresAuthenticatedUser
])
export default class Share extends Component {
    constructor(props) {
        super(props);

        this.state = {};

        this.initForm({
            leaveConfirmation: false
        });

        tableRestActionDialogInit(this);
    }

    static propTypes = {
        title: PropTypes.string,
        entity: PropTypes.object,
        entityTypeId: PropTypes.string
    }

    clearShareFields() {
        this.populateFormValues({
            entityTypeId: this.props.entityTypeId,
            entityId: this.props.entity.id,
            userId: null,
            role: null
        });
    }

    componentDidMount() {
        this.clearShareFields();
    }

    localValidateFormValues(state) {
        const t = this.props.t;

        if (!state.getIn(['userId', 'value'])) {
            state.setIn(['userId', 'error'], t('userMustNotBeEmpty'));
        } else {
            state.setIn(['userId', 'error'], null);
        }

        if (!state.getIn(['role', 'value'])) {
            state.setIn(['role', 'error'], t('roleMustBeSelected'));
        } else {
            state.setIn(['role', 'error'], null);
        }
    }

    @withFormErrorHandlers
    async submitHandler() {
        const t = this.props.t;

        this.disableForm();
        this.setFormStatusMessage('info', t('saving'));

        const submitSuccessful = await this.validateAndSendFormValuesToURL(FormSendMethod.PUT, 'rest/shares');

        if (submitSuccessful) {
            this.hideFormValidation();
            this.clearShareFields();
            this.enableForm();

            this.clearFormStatusMessage();
            this.sharesTable.refresh();
            this.usersTableSelect.refresh();

        } else {
            this.enableForm();
            this.setFormStatusMessage('warning', t('thereAreErrorsInTheFormPleaseFixThemAnd-1'));
        }
    }

    render() {
        const t = this.props.t;

        const sharesColumns = [];
        sharesColumns.push({ data: 0, title: t('username') });
        if (mailtrainConfig.isAuthMethodLocal) {
            sharesColumns.push({ data: 1, title: t('name') });
        }
        sharesColumns.push({ data: 2, title: t('role') });

        sharesColumns.push({
            actions: data => {
                const actions = [];
                const autoGenerated = data[4];

                if (!autoGenerated) {
                    const username = data[0];
                    const userId = data[3];

                    tableAddRestActionButton(
                        actions,
                        this,
                        {
                            method: HTTPMethod.PUT,
                            url: 'rest/shares',
                            data: {
                                entityTypeId: this.props.entityTypeId,
                                entityId: this.props.entity.id,
                                userId
                            },
                            refreshTables: () => {
                                this.sharesTable.refresh();
                                this.usersTableSelect.refresh();
                            }
                        },
                        { icon: 'trash-alt', label: t('unshare') },
                        t('confirmUnsharing'),
                        t('areYouSureYouWantToRemoveTheShareToUser', {username}),
                        t('removingShareForUserUsername', {username}),
                        t('shareForUserUsernameRemoved', {username}),
                        null
                    );
                }

                return actions;
            }
        });

        let usersLabelIndex = 1;
        const usersColumns = [
            { data: 1, title: "Username" },
        ];

        if (mailtrainConfig.isAuthMethodLocal) {
            usersColumns.push({ data: 2, title: "Full Name" });
            usersLabelIndex = 2;
        }


        const rolesColumns = [
            { data: 1, title: "Name" },
            { data: 2, title: "Description" },
        ];


        return (
            <div>
                {tableRestActionDialogRender(this)}
                <Title>{this.props.title}</Title>

                <h3 className="legend">{t('addUser')}</h3>
                <Form stateOwner={this} onSubmitAsync={::this.submitHandler}>
                    <TableSelect ref={node => this.usersTableSelect = node} id="userId" label={t('user')} withHeader dropdown dataUrl={`rest/shares-unassigned-users-table/${this.props.entityTypeId}/${this.props.entity.id}`} columns={usersColumns} selectionLabelIndex={usersLabelIndex}/>
                    <TableSelect id="role" label={t('role')} withHeader dropdown dataUrl={`rest/shares-roles-table/${this.props.entityTypeId}`} columns={rolesColumns} selectionLabelIndex={1}/>

                    <ButtonRow>
                        <Button type="submit" className="btn-primary" icon="check" label={t('share')}/>
                    </ButtonRow>
                </Form>

                <hr/>
                <h3 className="legend">{t('existingUsers')}</h3>

                <Table ref={node => this.sharesTable = node} withHeader dataUrl={`rest/shares-table-by-entity/${this.props.entityTypeId}/${this.props.entity.id}`} columns={sharesColumns} />
            </div>
        );
    }
}
