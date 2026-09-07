(function () {
    "use strict";

    if (!String.prototype.replaceAll) {
        Object.defineProperty(String.prototype, "replaceAll", {
            configurable: true,
            writable: true,
            value: function (search, replacement) {
                if (search instanceof RegExp) {
                    if (!search.global) throw new TypeError("replaceAll requires a global regular expression");
                    return this.replace(search, replacement);
                }
                return this.split(String(search)).join(replacement);
            },
        });
    }

    if (!Object.fromEntries) {
        Object.fromEntries = function (entries) {
            var result = {};
            Array.from(entries).forEach(function (entry) {
                result[entry[0]] = entry[1];
            });
            return result;
        };
    }

    if (!Array.prototype.flatMap) {
        Object.defineProperty(Array.prototype, "flatMap", {
            configurable: true,
            writable: true,
            value: function (callback, thisArg) {
                return Array.prototype.concat.apply([], this.map(callback, thisArg));
            },
        });
    }

    if (typeof File !== "undefined" && !File.prototype.text) {
        File.prototype.text = function () {
            var file = this;
            return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onload = function () { resolve(String(reader.result || "")); };
                reader.onerror = function () { reject(reader.error); };
                reader.readAsText(file);
            });
        };
    }

    if (typeof Element !== "undefined" && !Element.prototype.replaceChildren) {
        Element.prototype.replaceChildren = function () {
            while (this.firstChild) this.removeChild(this.firstChild);
            for (var index = 0; index < arguments.length; index += 1) {
                this.appendChild(arguments[index]);
            }
        };
    }
}());
