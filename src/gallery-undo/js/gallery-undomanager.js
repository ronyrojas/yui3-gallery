(function(){
    
    function UndoManager( config ){
        UndoManager.superclass.constructor.apply( this, arguments );
    }

    var Lang = Y.Lang,
    UMName = "UndoManager",
    ACTIONADDED = "actionAdded",
    BEFORECANCELING = "beforeCanceling",
    ACTIONCANCELED = "actionCanceled",
    CANCELINGFINISHED = "cancelingFinished",
    BEFOREUNDO = "beforeUndo",
    ACTIONUNDONE = "actionUndone",
    UNDOFINISHED = "undoFinished",
    BEFOREREDO = "beforeRedo",
    REDOFINISHED = "redoFinished",
    ACTIONREDONE = "actionRedone",
    ASYNCPROCESSING = "asyncProcessing",
    UNLIMITED = 0;

    UndoManager.NAME = UMName;

    UndoManager.ATTRS = {
        limit: {
            value: UNLIMITED,
            validator: function( value ){
                return Lang.isNumber( value ) && value >= 0;
            }
        },

        undoIndex : {
            readOnly: true,
            getter: function(){
                return this._undoIndex;
            }
        }
    };


    Y.extend( UndoManager, Y.Base, {

        _actions : [],
    
        _undoIndex : 0,
        
        _actionHandle : null,
        
        _processing : false,

    
        initializer : function( cfg ) {
            this._initEvents();
        
            this.after( "limitChange", Y.bind( this._afterLimit, this ) );
        },

    
        destructor : function() {
            this.purgeAll();
        },

    
        _initEvents : function(){
            this.publish( ACTIONADDED );
            this.publish( ACTIONCANCELED );
            this.publish( BEFOREUNDO );
            this.publish( ACTIONUNDONE );
            this.publish( UNDOFINISHED );
            this.publish( BEFOREREDO );
            this.publish( ACTIONREDONE );
            this.publish( REDOFINISHED );
        },
    
    
        add : function( action ){
            var curAction = null, actions, undoIndex, tmp;
        
            if( this._processing ){
                return false;
            }

            actions = this._actions;
            undoIndex = this._undoIndex;

            if( undoIndex > 0 ){
                curAction = actions[ undoIndex - 1 ];
            }

            if( undoIndex < actions.length ){
                this.fire( BEFORECANCELING );

                while( undoIndex < actions.length ){
                    tmp = actions.splice( -1, 1 )[0];

                    tmp.cancel();
                    this.fire( ACTIONCANCELED, {
                        'action': tmp,
                        index : actions.length
                    });
                }

                this.fire( CANCELINGFINISHED );
            }
        
            if( curAction ){
                if( !curAction.merge( action ) ){
                    actions.push( action );
                }
            } else {
                actions.push( action );
            }
        
            this._limitActions();
            this._undoIndex++;
        
            this.fire( ACTIONADDED, action );
            
            return true;
        },
    

        _limitActions : function( limit ){
            var actions, action,
            halfLimit, actionsLeft, actionsRight, deleteLeft, deleteRight,
            index, i, j;

            if( !limit ){
                limit = this.get( "limit" );
            }

            if( limit === UNLIMITED ){
                return;
            }
        
            actions = this._actions;

            if( actions.length <= limit ){
                return;
            }
        
            index = this._undoIndex;

            halfLimit = parseInt( limit / 2, 10 );

            actionsLeft = limit - halfLimit;
            actionsRight = limit - actionsLeft;

            deleteLeft = index - actionsLeft;
            deleteRight = actions.length - index - actionsRight;

            if( deleteLeft < 0 ){
                deleteRight += deleteLeft;
            } else if( deleteRight < 0 ){
                deleteLeft += deleteRight;
            }

            if( deleteLeft > 0 || deleteRight > 0 ){
                this.fire( BEFORECANCELING );

                for( i = 0; i < deleteLeft; i++ ){
                    this._undoIndex--;

                    action = actions.splice( 0, 1 )[0];
                    action.cancel();
                    this.fire( ACTIONCANCELED, {
                        'action': action,
                        index : 0
                    });
                }

                for( i = actions.length - 1, j = 0; j < deleteRight; i--, j++ ){
                    action = actions.splice( i, 1 )[0];
                    action.cancel();
                    this.fire( ACTIONCANCELED, {
                        'action': action,
                        index : i
                    });
                }

                this.fire( CANCELINGFINISHED );
            }
        },
    
    
        _afterLimit : function( params ){
            this._limitActions( params.newVal );
        },
    
    
        undo : function(){
            if( this.canUndo() ){
                this._undoTo( this._undoIndex - 1 );
            }
        },
    
    
        redo : function(){
            if( this.canRedo() ){
                this._redoTo( this._undoIndex + 1 );
            }
        },
    
        canUndo : function(){
            return !this._processing && this._undoIndex > 0;
        },
    
    
        canRedo : function(){
            return !this._processing && this._undoIndex < this._actions.length;
        },
    
    
        getUndoLabel : function(){
            var action;

            if( this.canUndo() ){
                action = this._actions[ this._undoIndex - 1 ];
                return action.get( "label" );
            }
        
            return null;
        },
    
    
        getRedoLabel : function(){
            var action;

            if( this.canRedo() ){
                action = this._actions[ this._undoIndex ];
                return action.get( "label" );
            }
        
            return null;
        },
    
    
        purgeAll : function(){
            var action, i;

            for( i = this._actions.length - 1; i >= 0; i-- ) {
                action = this._actions.splice( i, 1 )[0];

                action.cancel();
                this.fire( ACTIONCANCELED, {
                    'action': action,
                    index : i
                });
            }
        
            this._undoIndex = 0;
            this._processing = false;
        },


        processTo : function( undoIndex ){
            if( Lang.isNumber(undoIndex) && !this._processing &&
                undoIndex >= 0 && undoIndex <= this._actions.length ){
                if( this._undoIndex < undoIndex ){
                    this._redoTo( undoIndex );
                } else if( this._undoIndex > undoIndex ){
                    this._undoTo( undoIndex );
                }
            }
        },
        
        
        _redoTo : function( undoIndex ){
            var action = this._actions[ this._undoIndex ];
                    
            if( !action.get( ASYNCPROCESSING ) ){
                if( !this._processing ){
                    this.fire( BEFOREREDO );
                    this._processing = true;
                }
                
                this._undoIndex++;
                action.redo();
                this.fire( ACTIONREDONE, {
                    'action' : action,
                    index : this._undoIndex - 1
                } );

                if( this._undoIndex < undoIndex ){
                    this._redoTo( undoIndex );
                } else {
                    this._processing = false;
                    this.fire( REDOFINISHED );
                }
            } else {
                this._processing = true;
                this._actionHandle = action.on( REDOFINISHED,
                      Y.bind( this._onAsyncRedoFinished, this, action, undoIndex ) );

                this.fire( BEFOREREDO, action );
                this._undoIndex++;

                action.redo();
            }
        },
        
        
        _undoTo : function( undoIndex ){
            var action = this._actions[ this._undoIndex - 1 ];

            if( !action.get( ASYNCPROCESSING ) ){
                if( !this._processing ){
                    this.fire( BEFOREUNDO );
                    this._processing = true;
                }

                this._undoIndex--;
                action.undo();
                this.fire( ACTIONUNDONE, {
                    'action': action,
                    index : this._undoIndex
                });

                if( this._undoIndex > undoIndex ){
                    this._undoTo( undoIndex );
                } else {
                    this._processing = false;
                    this.fire( UNDOFINISHED );
                }
            } else {
                this._processing = true;

                action = this._actions[ this._undoIndex - 1 ];
                this._actionHandle = action.on( UNDOFINISHED,
                    Y.bind( this._onAsyncUndoFinished, this, action, undoIndex ) );

                this.fire( BEFOREUNDO, action );
                this._undoIndex--;

                action.undo();
            }
        },
        
        _onAsyncUndoFinished : function( action, undoIndex ){
            this._actionHandle.detach();
            this._actionHandle = null;
            
            this.fire( UNDOFINISHED, action );

            if( this._undoIndex > undoIndex ){
                this._undoTo( undoIndex );
            } else {
                this._processing = false;
            }
        },


        _onAsyncRedoFinished : function( action, undoIndex ){
            this._actionHandle.detach();
            this._actionHandle = null;
            
            this.fire( REDOFINISHED, action );

            if( this._undoIndex < undoIndex ){
                this._redoTo( undoIndex );
            } else {
                this._processing = false;
            }
        }
    });

    Y.UndoManager = UndoManager;

}());
