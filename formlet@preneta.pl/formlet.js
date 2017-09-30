/**
 * Form filling function.
 * Takes form data in the following format
 *  {
 *      'form': 'selector',     // form selector
 *      'elements': [           // array of arrays with elements data
 *          [
 *              name,           // element name
 *              index,          // index for elements with non-unique names (eg "array[]")
 *              method,         // method for setting the value (setValue, setChecked, setSelected)
 *              args            // value for element (string for setValue, bool for setChecked, array of strings for setSelected)
 *           ],
 *          [...]
 *       ]
 *  }
 * @param {Object} data Form data
 */
const formFiller = function(data) {
    /**
     * Placeholder for internal methods
     * @type {Object}
     */
    var methods = {
        /**
         * Gets form element by name or index; for non-unique names (arrays) 3rd param should be passed
         *
         * @param {HTMLFormElement} form
         * @param {String|Number}   name    name attr or index
         * @param {Number}          [index]
         * @return {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement}
         */
        getElement: function(form, name, index) {
            return form[name][index] || form[name];
        },
        /**
         * Set value for text-like inputs and textareas
         * @param {HTMLInputElement|HTMLTextAreaElement} element
         * @param {String} value
         */
        setValue: function(element, value) {
            element.value = value;
        },
        /**
         * Set value for checkbox and radio inputs
         * @param {HTMLInputElement} element
         * @param {Boolean} value
         */
        setChecked: function(element, value) {
            element.checked = !!value;
        },
        /**
         * Set value for selects
         * @param {HTMLSelectElement} element
         * @param {Array} values
         */
        setSelected: function(element, values) {
            var options = element.options;
            for (var i = 0; i < options.length; i++) {
                options[i].selected = values.indexOf(options[i].value) >= 0;
            }
        }
    };
    /* decode data */
    var elements = data.elements,
        form;

    /* find form */
    if (data.form === null) {
        /* get fucused form */
        form = document.activeElement;
        /* if this is frame - loop until we find non-frame element */
        if (form.contentDocument) {
            while (form.contentDocument) {
                form = form.contentDocument.activeElement;
            }
        }
        while (form.parentNode && form.nodeName.toLowerCase() !== 'form') {
            form = form.parentNode;
        }
    } else {
        form = document.querySelector(data.form);
    }

    for (var i = 0; i < elements.length; i++) {
        try {
            /* get element by it's name stored in 0 array item and optional index stored in 1 array element */
            var element = methods.getElement(form, elements[i][0], elements[i][1]);
            /* call method stored in 2 array item with args stored in 3 array item */
            methods[elements[i][2]](element, elements[i][3]);
        } catch (e) {}
    }
};

/**
 * Form serializer.
 * Serializes form to JSON-formatted data and generates code for bookmarklet
 * containing {formFiller} function with form data passed as argument
 *
 * @class
 */
class Serializer {
    /**
     * Initialize sterilizer routine
     *
     * @param {HTMLElement} form                    Form element to serialize
     * @param {Object}      options                 {Formlet} options object
     * @param {Boolean}     options.saveBlank
     * @param {Boolean}     options.saveHidden
     * @param {Boolean}     options.savePasswords
     *
     * @return {String} Bookmarklet code
     */
    constructor(form, options) {
        this.form = form;
        this.options = Object.assign({}, {
            saveBlank: true,
            saveHidden: true,
            savePasswords: true,
            saveFormId: true,
        }, options);
        this.index = Array.from(form.ownerDocument.forms).indexOf(form);
        this.data = {
            form: this.getFormSelector(),
            elements: this.serialize()
        };
    };

    /**
     * Generates form selector using it's id or position inside document
     *
     * @return {String} Form selector
     */
    getFormSelector() {
        let element = this.form,
            selector;
        if (!this.options.saveFormId) {
            selector = null;
        } else if (this.form.id) {
            selector = '#' + this.form.id;
        } else {
            let paths = [];
            for (; element && element.nodeType === Node.ELEMENT_NODE; element = element.parentNode) {
                let index = 0;
                for (let sibling = element.previousSibling; sibling; sibling = sibling.previousSibling) {
                    if (sibling.nodeType === Node.DOCUMENT_TYPE_NODE) {
                        continue;
                    }
                    if (sibling.nodeName === element.nodeName) {
                        ++index;
                    }
                }
                let tagName = element.nodeName.toLowerCase(),
                    pathIndex = (index ? ":nth-of-type(" + (index + 1) + ")" : "");
                paths.splice(0, 0, tagName + pathIndex);
            }
            selector = paths.length ? paths.join(">") : null;
        }

        return selector;
    };

    /**
     * Serialize form to array.
     * Each element is represented by array with following structure:
     *  [
     *      name,   // element name
     *      index,  // index for elements with non-unique names (eg "array[]")
     *      method, // method for setting the value (setValue, setChecked, setSelected)
     *      args    // value for element (string for setValue, bool for setChecked, array of strings for setSelected)
     *  ]
     *
     * @return {Array} Array of arrays with elements data
     */
    serialize() {
        let elements = this.form.elements,
            disallowedTypes = ['submit', 'reset', 'button', 'file'],
            data = [];
        if (!this.options.savePasswords) {
            disallowedTypes.push('password');
        }
        if (!this.options.saveHidden) {
            disallowedTypes.push('hidden');
        }
        for (let i = 0; i < elements.length; i++) {
            let element = elements[i],
                name = element.name || null,
                index = null,
                method = 'setValue',
                args = element.value,
                blank = !element.value;

            if (!name || disallowedTypes.indexOf(element.type) >= 0) {
                continue;
            }
            if (elements.namedItem(name) && (elements.namedItem(name) instanceof NodeList)) {
                index = Array.from(elements.namedItem(name)).indexOf(element);
            }
            if (element.nodeName.toLowerCase() === 'select') {
                method = 'setSelected';
                args = [];
                for (let o = 0; o < element.options.length; o++) {
                    if (element.options[o].selected) {
                        args.push(element.options[o].value);
                    }
                }
                blank = !args.length;
            } else if (element.nodeName.toLowerCase() === 'input' && ['radio', 'checkbox'].indexOf(element.type) >= 0) {
                method = 'setChecked';
                args = !!element.checked;
                blank = !args;
            }
            if (this.options.saveBlank || !blank) {
                data.push([name, index, method, args]);
            }
        }
        return data;
    };

    /**
     * Creates code for bookmarklet
     *
     * @return {String} Bookmarklet code
     */
    save() {
        // strip filler method from whitespaces and comments
        let spaces = /(\w+)?\s+/g,
            comments = /(\/\*.*?\*\/)/gi,
            /**
             * @todo swtich toSource to toString - later is supported by other browsers
             */
            source = formFiller.toSource().replace(spaces, function(a, b) {
                return ['var', 'return'].indexOf(b) >= 0 ? a : (b || '');
            }).replace(comments, '');

        this.code = 'javascript:' + source + '(' + JSON.stringify(this.data) + ')';
        return this.code;
    };
}

function findForm(element) {
    while (element && element.parentNode && element.nodeName.toLowerCase() !== 'form') {
        element = element.parentNode;
    }
    let isForm = element.nodeName.toLowerCase() === 'form';

    return isForm ? element : false;

}

function saveForm(options, element = null) {
    let form = findForm(element || document.activeElement),
        x = new Serializer(form, options);
    return x.save();
}

window.addEventListener("mousedown", event => {
    if (event.button === 2) {
        setupContextMenu(event);
    }
}, true);

window.addEventListener("keydown", event => {
    if (event.shiftKey && event.key === "F10" || event.key === "ContextMenu") {
        setupContextMenu(event);
    }
}, true);

function setupContextMenu(event) {
    browser.runtime.sendMessage({
        formFound: !!findForm(event.target)
    });
}

function handleHessage(request, sender, callback) {
    if (sender.id === browser.runtime.id) {
        return new Promise((resolve) => {
            let result = saveForm(request);
            resolve({
                title: document.title,
                code: result
            });
        });
    }
}

browser.runtime.onMessage.addListener(handleHessage);
