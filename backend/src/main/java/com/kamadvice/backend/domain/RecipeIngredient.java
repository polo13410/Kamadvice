package com.kamadvice.backend.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * One line of a {@link Recipe}: a required quantity of either a
 * {@link Resource} or an {@link Item} (a recipe can use another
 * craftable item as an ingredient). Exactly one of {@code resource}
 * or {@code item} must be set; this is enforced by a DB check
 * constraint (see the Flyway migration).
 */
@Entity
@Table(name = "recipe_ingredient")
public class RecipeIngredient {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "recipe_id")
    private Recipe recipe;

    @ManyToOne
    @JoinColumn(name = "resource_id")
    private Resource resource;

    @ManyToOne
    @JoinColumn(name = "item_id")
    private Item item;

    private int quantity;

    protected RecipeIngredient() {
        // JPA
    }

    private RecipeIngredient(Recipe recipe, Resource resource, Item item, int quantity) {
        this.recipe = recipe;
        this.resource = resource;
        this.item = item;
        this.quantity = quantity;
    }

    public static RecipeIngredient ofResource(Recipe recipe, Resource resource, int quantity) {
        return new RecipeIngredient(recipe, resource, null, quantity);
    }

    public static RecipeIngredient ofItem(Recipe recipe, Item item, int quantity) {
        return new RecipeIngredient(recipe, null, item, quantity);
    }

    public Long getId() {
        return id;
    }

    public Recipe getRecipe() {
        return recipe;
    }

    public Resource getResource() {
        return resource;
    }

    public Item getItem() {
        return item;
    }

    public int getQuantity() {
        return quantity;
    }
}
