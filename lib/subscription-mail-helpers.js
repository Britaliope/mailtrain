'use strict';

const log = require('npmlog');
const config = require('config');
let db = require('./db');
let fields = require('./models/fields');
let settings = require('./models/settings');
let mailer = require('./mailer');
let urllib = require('url');
let helpers = require('./helpers');
let tools = require('./tools');
let _ = require('./translate')._;
let util = require('util');


module.exports = {
    sendAlreadySubscribed,
    sendConfirmAddressChange,
    sendConfirmSubscription,
    sendConfirmUnsubscription,
    sendSubscriptionConfirmed,
    sendUnsubscriptionConfirmed
};

function sendSubscriptionConfirmed(list, email, subscription, callback) {
    const relativeUrls = {
        preferencesUrl: '/subscription/' + list.cid + '/manage/' + subscription.cid,
        unsubscribeUrl: '/subscription/' + list.cid + '/unsubscribe/' + subscription.cid
    };

    subscriptions.sendMail(list, email, 'subscription-confirmed', _('%s: Subscription Confirmed'), relativeUrls, {}, data.subscriptionData, callback);
}

function sendAlreadySubscribed(list, email, subscription, callback) {
    const mailOpts = {
        ignoreDisableConfirmations: true
    };
    const relativeUrls = {
        preferencesUrl: '/subscription/' + list.cid + '/manage/' + subscription.cid,
        unsubscribeUrl: '/subscription/' + list.cid + '/unsubscribe/' + subscription.cid
    };
    module.exports.sendMail(list, email, 'already-subscribed', _('%s: Email Address Already Registered'), relativeUrls, mailOpts, subscription, callback);
}

function sendConfirmAddressChange(list, email, cid, subscription, callback) {
    const mailOpts = {
        ignoreDisableConfirmations: true
    };
    const relativeUrls = {
        confirmUrl: '/subscription/confirm/' + cid
    };
    module.exports.sendMail(list, email, 'confirm-address-change', _('%s: Please Confirm Email Change in Subscription'), relativeUrls, mailOpts, subscription, callback);
}

function sendConfirmSubscription(list, email, cid, subscription, callback) {
    const mailOpts = {
        ignoreDisableConfirmations: true
    };
    const relativeUrls = {
        confirmUrl: '/subscription/confirm/' + cid
    };
    module.exports.sendMail(list, email, 'confirm-subscription', _('%s: Please Confirm Subscription'), relativeUrls, mailOpts, subscription, callback);
}

function sendConfirmUnsubscription(list, email, cid, subscription, callback) {
    const mailOpts = {
        ignoreDisableConfirmations: true
    };
    const relativeUrls = {
        confirmUrl: '/subscription/confirm/' + cid
    };
    module.exports.sendMail(list, email, 'confirm-unsubscription', _('%s: Please Confirm Unsubscription'), relativeUrls, mailOpts, subscription, callback);
}

function sendUnsubscriptionConfirmed(list, email, subscription, callback) {
    const relativeUrls = {
        subscribeUrl: '/subscription/' + list.cid + '?cid=' + subscription.cid
    };
    subscriptions.sendMail(list, email, 'unsubscription-confirmed', _('%s: Unsubscribe Confirmed'), relativeUrls, {}, subscription, callback);
}


function sendMail(list, email, template, subject, relativeUrls, mailOpts, subscription, callback) {
    db.getConnection((err, connection) => {
        if (err) {
            return callback(err);
        }

        fields.list(list.id, (err, fieldList) => {
            if (err) {
                return callback(err);
            }

            let encryptionKeys = [];
            fields.getRow(fieldList, subscription).forEach(field => {
                if (field.type === 'gpg' && field.value) {
                    encryptionKeys.push(field.value.trim());
                }
            });

            settings.list(['defaultHomepage', 'defaultFrom', 'defaultAddress', 'defaultPostaddress', 'serviceUrl', 'disableConfirmations'], (err, configItems) => {
                if (err) {
                    return callback(err);
                }

                if (!mailOpts.ignoreDisableConfirmations && configItems.disableConfirmations) {
                    return;
                }

                const data = {
                    title: list.name,
                    homepage: configItems.defaultHomepage || configItems.serviceUrl,
                    contactAddress: configItems.defaultAddress,
                    defaultPostaddress: configItems.defaultPostaddress,
                };

                for (let relativeUrlKey in relativeUrls) {
                    data[relativeUrlKey] = urllib.resolve(configItems.serviceUrl, relativeUrls[relativeUrlKey]);
                }

                function sendMail(html, text) {
                    mailer.sendMail({
                        from: {
                            name: configItems.defaultFrom,
                            address: configItems.defaultAddress
                        },
                        to: {
                            name: [].concat(subscription.firstName || []).concat(subscription.lastName || []).join(' '),
                            address: email
                        },
                        subject: util.format(subject, list.name),
                        encryptionKeys
                    }, {
                        html,
                        text,
                        data
                    }, err => {
                        if (err) {
                            log.error('Subscription', err);
                        }
                    });
                }

                let text = {
                    template: 'subscription/mail-' + template + '-text.hbs'
                };

                let html = {
                    template: 'subscription/mail-' + template + '-html.mjml.hbs',
                    layout: 'subscription/layout.mjml.hbs',
                    type: 'mjml'
                };

                helpers.injectCustomFormTemplates(list.defaultForm, { text, html }, (err, tmpl) => {
                    if (err) {
                        return sendMail(html, text);
                    }

                    sendMail(tmpl.html, tmpl.text);
                });

                return callback();
            });
        });
    });
}