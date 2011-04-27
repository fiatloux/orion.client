/******************************************************************************* 
 * Copyright (c) 2011 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 * 
 * Contributors: IBM Corporation - initial API and implementation 
 ******************************************************************************/

/*jslint devel:true regexp:false laxbreak:true*/
/*global dojo orion:true*/

orion = orion || {};

orion.styler = orion.styler || {};

/**
 * A styler that does nothing, but can be extended by concrete stylers. Extenders can call 
 * {@link orion.styler.AbstractStyler.extend} and provide their own {@link #_onSelection}, 
 * {@link #_onModelChanged}, {@link #_onDestroy} and {@link #_onLineStyle} methods.
 * @class orion.styler.AbstractStyler
 */
orion.styler.AbstractStyler = (function() {
	/** @inner */
	function AbstractStyler() {
	}
	AbstractStyler.prototype = /** @lends orion.styler.AbstractStyler.prototype */ {
		/**
		 * Initializes this styler with an editor. Extenders <b>must</b> call this from their constructor.
		 * @param {eclipse.Editor} editor
		 */
		initialize: function(editor) {
			this.editor = editor;
			
			editor.addEventListener("Selection", this, this._onSelection);
			editor.addEventListener("ModelChanged", this, this._onModelChanged);
			editor.addEventListener("Destroy", this, this._onDestroy);
			editor.addEventListener("LineStyle", this, this._onLineStyle);
		},
		
		/**
		 * Destroys this styler and removes all listeners. Called by the editor.
		 */
		destroy: function() {
			if (this.editor) {
				this.editor.removeEventListener("Selection", this, this._onSelection);
				this.editor.removeEventListener("ModelChanged", this, this._onModelChanged);
				this.editor.removeEventListener("Destroy", this, this._onDestroy);
				this.editor.removeEventListener("LineStyle", this, this._onLineStyle);
				this.editor = null;
			}
		},
		
		/** To be overridden by subclass.
		 * @public
		 */
		_onSelection: function(/**eclipse.SelectionEvent*/ e) {},
		
		/** To be overridden by subclass.
		 * @public
		 */
		_onModelChanged: function(/**eclipse.ModelChangingEvent*/ e) {},
		
		/** To be overridden by subclass.
		 * @public
		 */
		_onDestroy: function(/**eclipse.DestroyEvent*/ e) {},
		
		/** To be overridden by subclass.
		 * @public
		 */
		_onLineStyle: function(/**eclipse.LineStyleEvent*/ e) {}
	};
	
	return AbstractStyler;
}());

/**
 * Helper for extending AbstractStyler.
 * @methodOf orion.styler.AbstractStyler
 * @static
 * @param {Function} subCtor The constructor function for the subclass.
 * @param {Object} [proto] Object to be mixed into the subclass's prototype. This object can contain your 
 * implementation of _onSelection, _onModelChanged, etc.
 * @see orion.styler.TextMateStyler for example usage.
 */
orion.styler.AbstractStyler.extend = function(subCtor, proto) {
	if (typeof(subCtor) !== "function") { throw new Error("Function expected"); }
	subCtor.prototype = new orion.styler.AbstractStyler();
	subCtor.constructor = subCtor;
	for (var p in proto) {
		if (proto.hasOwnProperty(p)) { subCtor.prototype[p] = proto[p]; }
	}
};

orion.styler.Util = {
	/**
	 * @returns {String} str with JSON-escaped control character sequences converted to real control characters.
	 */
	escapeJson: function(/**String*/ str) {
		return str.replace(new RegExp("\\\\n", "g"), "\n")
			.replace(new RegExp("\\\\t", "g"), "\b")
			.replace(new RegExp("\\\\t", "g"), "\t");
	},
	
	// Rules to detect some unsupported Oniguruma features
	unsupported: [
		{regex: /\(\?[ims\-]:/, func: function(match) { return "option on/off for subexp"; }},
		{regex: /\(\?<([=!])/, func: function(match) { return (match[1] === "=") ? "lookbehind" : "negative lookbehind"; }},
		{regex: /\(\?>/, func: function(match) { return "atomic group"; }}
	],
	
	/**
	 * @param {String} str String giving a regular expression pattern from a TextMate JSON grammar.
	 * @param {String} [flags] [ismg]+
	 * @returns {RegExp}
	 */
	toRegExp: function(str, flags) {
		flags = flags || "";
		function fail(feature, match) {
			throw new Error("Unsupported regex feature \"" + feature + "\": \"" + match[0] + "\" at index: "
					+ match.index + " in " + match.input);
		}
		var match, i;
		for (i=0; i < this.unsupported.length; i++) {
			if ((match = this.unsupported[i].regex.exec(str))) {
				fail(this.unsupported[i].func(match));
			}
		}
		
		// Handle (?x)expr ("x" flag that applies to entire regex)
		var str2 = "";
		if ((match = /^\(\?x\)/.exec(str))) {
			// Eat \s+ (whitespace) and #.* (comment up to EOL) if they occur outside []
			var insideCharacterClass = false;
			for (i=0; i < str.length; ) {
				var match2;
				if ((match2 = /\s+|#.*/.exec(str)) && match2.index === i) {
					i = match2.index + match2[0].length;
					console.debug("Ate " + match2[0]);
				} else {
					var char = str.charAt(i);
					if (char === "[") {
						insideCharacterClass = true;
					} else if (char === "]") {
						insideCharacterClass = false;
					}
					str2 += char;
					i++;
				}
			}
		}
		str2 = str2 || str;
		str2 = orion.styler.Util.escapeJson(str2);
		// TODO: tolerate /(?xExpr)/ -- eg. in JSON grammar
		// TODO: tolerate /(?iSubExp)/ -- eg. in PHP grammar (trickier)
		return new RegExp(str2, flags);
	}
};

/**
 * A styler that knows how to apply a limited subset of the TextMate grammar format to style a line.<p>
 *
 * <h4>Styling from a grammar:</h4>
 * Each scope name given in the grammar is converted to an array of CSS class names. For example 
 * a region of text with scope <tt>keyword.control.php</tt> will be assigned the CSS classes 
 * <pre>keyword, keyword-control, keyword-control-php</pre>
 *
 * A CSS file can give rules matching any of these class names to provide generic or more specific styling.
 * For example, <pre>.keyword { font-color: blue; }</pre> colors all keywords blue, while
 * <pre>.keyword-control-php { font-weight: bold; }</pre> bolds only PHP control keywords.
 *
 * This is useful when using grammars that adhere to TextMate's
 * <a href="http://manual.macromates.com/en/language_grammars.html#naming_conventions">scope name conventions</a>,
 * as a single CSS rule can provide consistent styling to similar constructs across different languages.<p>
 * 
 * <h4>Supported top-level grammar features:</h4>
 * <ul><li><tt>scopeName, fileTypes, patterns, repository</tt> (but see below) are supported.</li>
 * <li><tt>firstLineMatch, foldingStartMarker, foldingStopMarker</tt> are not supported.</li>
 * </ul>
 *
 * <h4>Supported grammar rule features:</h4>
 * <ul><li><tt>match</tt> patterns are supported.</li>
 * <li><tt>name</tt> scope is supported.</li>
 * <li><tt>begin/end</tt> patterns are not supported and are ignored, along with their subrules. Consequently, 
 *   matched constructs may <b>not</b> span multiple lines.</li>
 * <li><tt>contentName, beginCaptures, endCaptures, applyEndPatternLast</tt> are not supported.</li>
 * <li><tt>captures</tt> is not supported.</li>
 * <li><tt>include</tt> is supported, but only when referencing a rule in the current grammar's <tt>repository</tt>.
 *   Including <tt>$self</tt>, <tt>$base</tt>, or <tt>rule.from.another.grammar</tt> is not supported.</li>
 * <li>The <tt>(?x)</tt> option is supported only when it appears at the beginning of a regex pattern.</li>
 * <li>Matching is done using native JavaScript {@link RegExp}s. As a result, many Oniguruma features are not supported.
 *   Unsupported features include:
 *   <ul><li>Named captures</li>
 *   <li>Setting flags inside groups (eg. <tt>a(?i:b)c</tt>)</li> *   <li>Lookbehind and negative lookbehind</li>
 *   <li>Subexpression call</li>
 *   <li>etc.</li>
 *   </ul>
 * </li>
 * </ul>
 *
 * @class orion.styler.TextMateStyler
 * @extends orion.styler.AbstractStyler
 * @param {eclipse.Editor} editor The editor.
 * @param {Object} grammar The TextMate grammar as a JSON object. You can use a plist-to-JSON conversion tool
 * to produce this object. Note that not all features of TextMate grammars are supported.
 */
orion.styler.TextMateStyler = (function() {
	/** @inner */
	function TextMateStyler(editor, grammar) {
		this.initialize(editor);
		this.grammar = this._copy(grammar);
		// key: {String} scopeName, value: {eclipse.Style[]} styles
		this._styles = {};
		this._preprocess();
	}
	orion.styler.AbstractStyler.extend(TextMateStyler, /** @lends orion.styler.TextMateStyler.prototype */ {
		_copy: function(grammar) {
			// Use a copy of the grammar object, since we'll mutate it
			return JSON.parse(JSON.stringify(grammar));
		},
		_preprocess: function() {
			var stack = [this.grammar];
			for (; stack.length !== 0; ) {
				var rule = stack.pop();
				if (rule.__resolvedRule && rule.__cachedTypedRule) {
					continue;
				}
//				console.debug("Process " + (rule.include || rule.name));
				
				// Look up include'd rule, create typed *Rule instance
				rule.__resolvedRule = this._resolve(rule);
				rule.__cachedTypedRule = this._createTypedRule(rule);
				
				// Convert the scope names to styles and cache them for later
				this._addStyles(rule.name);
				this._addStylesForCaptures(rule.captures);
				// TODO future: this._addStyles(rule.contentName);
				
				if (rule.__resolvedRule !== rule) {
					// Add include target
					stack.push(rule.__resolvedRule);
				}
				if (rule.patterns) {
					// Add subrules
					for (var i=0; i < rule.patterns.length; i++) {
						stack.push(rule.patterns[i]);
					}
				}
			}
		},
		
		/**
		 * Adds eclipse.Style objects for scope to our _styles cache.
		 * @param {String} scope A scope name, like "constant.character.php".
		 */
		_addStyles: function(scope) {
			if (scope && !this._styles[scope]) {
				this._styles[scope] = dojo.map(scope.split("."),
						function(segment, i, segments) {
							return { styleClass: segments.slice(0, i+1).join("-") };
						});
//				console.debug("add style for " + scope + " = " + this._styles[scope]);
			}
		},
		
		_addStylesForCaptures: function(/**Object*/ captures) {
			for (var prop in captures) {
				if (captures.hasOwnProperty(prop)) {
					var scope = captures[prop].name;
					this._addStyles(scope);
				}
			}
		},
		
		/**
		 * A rule that contains subrules ("patterns" in TextMate parlance) but has no "begin" or "end".
		 * Also handles top level of grammar.
		 * @private
		 */
		ContainerRule: (function() {
			function ContainerRule(rule) {
				this.rule = rule;
			}
			return ContainerRule;
		}()),
		
		/**
		 * A rule with a "match" pattern.
		 * @private
		 */
		MatchRule: (function() {
			function MatchRule(/**Object*/ rule) {
				this.rule = rule;
				// To use lastIndex for starting search from non-0 index, need global flag here
				this.matchRegex = orion.styler.Util.toRegExp(rule.match, "g");
			}
			return MatchRule;
		}()),
		
		/**
		 * @param {Object} rule A rule from the JSON grammar.
		 * @returns {MatchRule|ContainerRule|null} Returns null if rule is a begin/end rule (= not supported).
		 */
		_createTypedRule: function(rule) {
			if (rule.match) {
				return new this.MatchRule(rule);
			} else if (rule.begin) {
				return null; // Ignore begin/end rules; unsupported
			} else {
				return new this.ContainerRule(rule);
			}
		},
		
		/**
		 * Resolves a rule from the grammar (which may be an include) into the real rule that it points to.
		 */
		_resolve: function(rule) {
			var resolved = rule;
			if (rule.include) {
				if (rule.begin || rule.end || rule.match) {
					throw new Error("Unexpected patterns in include rule");
				}
				var name = rule.include;
				if (name.charAt(0) === "#") {
					resolved = this.grammar.repository && this.grammar.repository[name.substring(1)];
					if (!resolved) { throw new Error("Couldn't find included rule " + name + " in grammar repository"); }
				} else if (name === "$self") {
					resolved = this.grammar;
				} else if (name === "$base") {
					// $base is only relevant when including rules from foreign grammars
					throw new Error("include $base not supported"); 
				} else {
					throw new Error("Include external rule " + name + " not supported");
				}
			}
			return resolved;
		},
		
		/**
		 * @class ScopeRange Represents a range in the input that a scope name applies to.
		 * @property {Number} start
		 * @property {Number} end
		 * @property {String} scope
		 */
		/**
		 * Adds the scopes in rule to the ranges array.
		 */
		_applyScopes: function(/**ScopeRange[]*/ ranges, /**Object*/ rule, /**Match*/ match, /**RegExp*/ regex) {
			var start = match.index,
			    end = start + match[0].length,
			    name = rule.rule.name;
			if (name) {
				// apply name to the whole matching region
				console.debug("X apply " + name + " to " + match[0]);
				ranges.push({start: start, end: end, scope: name});
			}
			// Apply captures to individual matching groups
			var captures = rule.rule.captures;
			for (var groupNum in captures) {
				if (captures.hasOwnProperty(groupNum)) {
					var scope = captures[groupNum].name;
					var groupText = match[groupNum];
					console.debug("TODO apply " + scope + " to " + groupText);
					/* TODO: workaround for JS having no API for getting matching group start index
					var newRegex = parse regex, wrap every un-matching-paren'd term with matching parens
					var old2New = map matching group #s in regex to #s in newRegex
					// Match again against newRegex. Note that newMatch[0] is guaranteed to be start..end
					newRegex.lastIndex = start;
					var newMatch = newRegex.exec(match.input.substring(0, end+1));
					newRegex.lastIndex = 0;
					var groupRanges = sum up lengths of newMatch[1], newMatch[2], ... to get matching group ranges
					for (var groupNum = 1; newMatch[groupNum]; groupNum++) {
						var oldGroupNum = old2New[groupNum];
						if (typeof(oldGroupNum) !== "undefined") {
							var scope = captures[oldGroupNum].name;
							ranges.push({start: groupStart, end: groupEnd, scope: scope});
						}
					}
					*/
				}
			}
		},
		
		/**
		 * @param {String} line
		 * @return {ScopeRange[]}
		 */
		_getScopesForLine: function(line) {
			var scopeRanges = [];
			var pos = 0;
			var len = line.length;
			var stack = [].concat(this.grammar.patterns || []);
			while (stack.length && pos < len) {
				var top = stack.pop();
				var rule = top.__resolvedRule.__cachedTypedRule;
				if (!rule) {
					continue;
				} else if (rule instanceof this.MatchRule) {
					var regex = rule.matchRegex;
//					console.debug("Matching " + rule.matchRegex + " against " + line.substring(pos));
					// use lastIndex to start searching from pos
					regex.lastIndex = pos;
					var match = regex.exec(line);
					regex.lastIndex = 0; // reset for safety since regex is reused
					if (match) {
						// consume the match
						pos += match[0].length;
						this._applyScopes(scopeRanges, rule, match, regex);
					}
				} else if (rule instanceof this.ContainerRule) {
					var subrules = rule.rule.patterns;
					for (var i=subrules.length-1; i; i--) {
						stack.push(subrules[i]);
					}
				}
			}
			// TODO: does it matter *why* we stopped (EOL vs. empty stack?)
			return scopeRanges;
		},
		
		/**
		 * Applies the grammar to obtain the {@link eclipse.StyleRange[]} for the given line.
		 * @return eclipse.StyleRange[]
		 */
		getStyleRangesForLine: function(/**String*/ line) {
			var scopeRanges = this._getScopesForLine(line);
			var styleRanges = [];
			for (var i=0; i < scopeRanges.length; i++) {
				var scopeRange = scopeRanges[i];
				var classNames = this._styles[scopeRange.scope];
				if (!classNames) { throw new Error("styles not found for " + scopeRange.scope); }
				for (var j=0; j < classNames.length; j++) {
					styleRanges.push({start: scopeRange.start, end: scopeRange.end, style: classNames[j]});
				}
			}
			return styleRanges;
		},
		
		_onSelection: function(e) {
		},
		_onModelChanged: function(/**eclipse.ModelChangingEvent*/ e) {
			// Re-style the changed lines?
		},
		_onDestroy: function(/**eclipse.DestroyEvent*/ e) {
			this.grammar = null;
			this._styles = null;
		},
		_onLineStyle: function(/**eclipse.LineStyleEvent*/ e) {
			console.debug("_onLineStyle lineIndex:" + e.lineIndex + ", lineStart:" + e.lineStart + ", " + "lineText:" + e.lineText);
			e.ranges = this.getStyleRangesForLine(e.lineText);
		}
	});
	return TextMateStyler;
}());
